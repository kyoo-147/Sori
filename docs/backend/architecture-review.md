# Backend architecture review: API, runtime, DB, FE/BE integration

This review accompanies the Lavish artifact at `.lavish/backend-architecture-review.html`.

## Current API surfaces

### HTTP prototype API

Implemented in `src/adapters/http/app.ts`; storage is in-memory and separate from `sorid`/SQLite.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Generic service health. |
| GET | `/projects` | List in-memory projects. |
| POST | `/projects` | Create project. |
| GET | `/projects/:projectId/artifacts` | List project artifacts. |
| POST | `/projects/:projectId/artifacts` | Create project artifact. |
| GET | `/projects/:projectId/runs` | List project runs. |
| POST | `/projects/:projectId/runs` | Create run and queued event. |
| GET | `/runs/:runId/events` | List run events. |

Assessment: this is not the real desktop runtime API. It should be marked dev/prototype or split from the Sori Desktop daemon path.

### Rust local IPC contract

Implemented in `crates/sori-ipc`.

Requests currently defined:

- `Status`
- `Doctor`
- `ConfigSummary`
- `RecentEvents { limit }`

Assessment: contract is a good start, but `LocalIpcClient::connect()` currently always returns `Unavailable`, so no real daemon transport exists.

### TS tray/frontend protocol

Implemented in:

- `src/tray/protocol.ts`
- `src/frontend/ipc-bridge.ts`

Assessment: UI can map mock/backend-like shapes, but TypeScript and Rust contracts can drift. Rust IPC should become the source of truth, with mirrored/generated TS types.

## Runtime system status

Current layers:

```text
React/Vite UI -> TS RuntimeClient mock/fallback -> no real IPC transport -> sorid lifecycle runtime -> core/audio/asr/injection/persistence scaffolds
```

What works now:

- `sori smoke dictation`: fake E2E pipeline.
- `sorid`: starts, logs Ready, waits for Ctrl+C.
- Rust tests cover core/persistence/ipc/provider/audio logic.
- Desktop UI builds and runs in Vite.

Main gap:

- `sori status`/`sori doctor` cannot talk to `sorid` because no local IPC server/client transport is implemented.

## SQLite schema

Migration: `crates/sori-persistence/src/migrations/001_initial.sql`.

Tables:

- `settings(key, value_json, updated_at)`
- `history(id, at_seconds, at_nanos, active_app, transcript_json, intent_json, route_json, inserted_text)`
- `events(id, at_seconds, at_nanos, kind, payload_json)`
- `model_manifests(id, manifest_json, updated_at)`
- `model_routes(name, route_json, updated_at)`

Indexes:

- `history_at_idx` on `(at_seconds DESC, at_nanos DESC)`
- `events_at_idx` on `(at_seconds DESC, at_nanos DESC)`

Assessment:

- Good local-first MVP schema.
- Needs migration versioning.
- Needs retention/purge-by-age support.
- Querying by app/model/language will be limited because many fields are JSON blobs.

## FE/BE coupling issues

| Priority | Issue | Fix |
|---|---|---|
| P0 | No real daemon IPC transport. | Implement local pipe/socket server in `sorid` and real `LocalIpcClient`. |
| P0 | HTTP API is unrelated to Sori Desktop runtime. | Mark dev/prototype or remove from product path. |
| P1 | Rust IPC and TS tray protocol are separate contracts. | Make Rust IPC the source of truth and mirror/generate TS types. |
| P1 | `sorid` uses `InMemoryEventBus`, not `SqliteStore`. | Open SQLite in daemon and serve recent events/history from it. |
| P1 | Missing Pause/Resume and recent history in Rust IPC. | Extend IPC requests/responses. |
| P1 | UI still uses mock initial data. | Route UI through RuntimeClient/Tauri transport with mock fallback only for preview. |

## Implementation plan

### Phase A: Contract lock

- Extend `sori-ipc::Request` with `Pause`, `Resume`, `RecentHistory { limit }`, `RouteSummary`, `PermissionSummary`.
- Extend `StatusResponse` with daemon state, activity, paused, hotkey, route/model.
- Add TS mirror contract or JSON schema.

### Phase B: Local transport

- Windows-first named pipe: `\\.\pipe\sori-daemon`.
- macOS/Linux later Unix socket.
- Use framed JSON request/response.
- Local user session only; no network.

### Phase C: `sorid` integration

- Boot daemon with config + SQLite store.
- Start IPC server task.
- Serve status/doctor/config/events/history.
- Implement pause/resume state changes.

### Phase D: CLI/UI connection

- Update `sori status/doctor` to use real IPC.
- Add Tauri command bridge from UI to daemon IPC.
- Keep browser mock fallback for Vite preview.

### Phase E: Tests

- Spawn `sorid` on temp pipe/socket and temp SQLite DB.
- Assert CLI `status`, `doctor`, `pause/resume`, `recent-events` work.
- Add UI RuntimeClient mapping tests for real IPC shapes.
