# Backend architecture review: daemon, IPC, DB, and desktop integration

## Current architecture

```text
React/Tauri shell → Tauri command bridge → loopback IPC → sorid (Rust) → SQLite
```

The Rust daemon, local transport, SQLite store, and native desktop bridge exist. The older TypeScript/Fastify API under `src/` is a separate prototype and is not the desktop runtime API.

## Current API surfaces

### Rust local IPC

Implemented in `crates/sori-ipc` and consumed by `sorid` and the Tauri command bridge. It supports status, doctor, configuration summary, pause/resume, and recent events. The endpoint is loopback/local-only; it is not a network product API.

### Tauri/React client

`apps/desktop` prefers the native `sori_ipc` command, which forwards canonical requests to the daemon. Browser development can fall back to the HTTP prototype or mock data. Those fallbacks are explicitly non-native preview paths.

## Persistence

`sori-persistence` applies the initial SQLite migration and `sorid` persists lifecycle events. Recent events and doctor checks can be read through IPC. Retention/purge policy and richer history queries remain follow-up work.

## Runtime status

Implemented: daemon lifecycle, loopback control/diagnostics, SQLite event persistence, native shell bridge, and UI status/doctor rendering.

Scaffold: platform hotkey, microphone/audio/VAD, Whisper execution, and text injection. Their contracts and tests do not constitute a working end-to-end voice path.

## Priority gaps

| Priority | Gap | Exit condition |
|---|---|---|
| P0 | Windows hotkey + microphone path | Hold-to-talk produces captured audio in `sorid`. |
| P0 | Whisper execution | A configured local model returns a transcript. |
| P0 | Text injection | Transcript reaches a focused supported app, with clear fallback errors. |
| P1 | First-run permissions/recovery | Windows permission failures are actionable and repeatable. |
| P1 | Packaging/signing | A manually testable Windows desktop bundle exists. |

See [MVP capability matrix](../mvp-capability-matrix.md) for the concise status contract.
