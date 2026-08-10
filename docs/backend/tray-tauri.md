# Tray/Tauri client

## Decision

Do not add Tauri dependencies to the workspace yet. The repository currently has no frontend package or daemon IPC transport, and adding a generated Tauri project would add platform-specific build and system-library requirements before either boundary is stable. The first client milestone is therefore a dependency-free contract and a thin shell plan. This keeps the current Node and Rust CI checks reproducible while leaving the client boundary explicit.

The eventual client is a small Tauri application (React UI is optional) that runs in the tray, talks only to `sorid`, and opens full settings/studio surfaces on demand. It must not contain audio, model, or persistence logic.

## Current scaffold

The dependency-free TypeScript shell scaffold lives in `src/tray/`. It defines the v1 request/response types, keeps daemon status as the source of tray state, and exposes the agreed menu contract: Ready, Pause, Profile, Mic, Route, Settings, Diagnostics, and Quit. `TrayTransport` is intentionally an adapter boundary; it can be backed by the local IPC implementation from issue #18 without adding a network endpoint or Tauri dependencies.

Until `sorid` has a real IPC adapter, run the deterministic mock shell with:

```sh
npm install
npm run tray:mock
```

The mock prints a status payload and menu entries only. It is not a daemon or a platform tray process. Validate the contract with `npm run check`; the existing Rust validation remains unchanged. When issue #18 is available, implement `TrayTransport.send` using its newline-delimited JSON framing and preserve the request IDs, protocol version, method names, and status payload below.

## Staged implementation

1. **Contract (now):** reserve a versioned request/response envelope and the tray operations below.
2. **Daemon transport:** implement local IPC in `sorid` (Windows named pipe; Unix domain socket on macOS/Linux), with peer/OS-user validation and request IDs. Keep the same JSON messages on every platform.
3. **Shell spike:** add `apps/tray-tauri` only after the transport can answer `status` and `pause`/`resume`. Pin Tauri and frontend versions and add a platform-specific CI job rather than changing the existing workspace checks.
4. **Product wiring:** add tray menu/state subscriptions, settings/models/benchmark windows, installer packaging, permissions, and signing after the shell is manually tested on Windows.

## IPC contract v1

Transport framing is newline-delimited UTF-8 JSON for the initial development adapter. The production named-pipe/socket adapter may use length framing, but the JSON envelope and method names remain unchanged. A client sends one request and receives one response; unsolicited events are a later, separately versioned capability.

### Request

```json
{
  "id": "req_01J...",
  "version": 1,
  "method": "status",
  "params": {}
}
```

`id` is a client-generated opaque string, `version` is the integer protocol version, and `params` is always present (an empty object when unused). The client must time out and surface daemon-unavailable errors; it must not silently mutate local state.

### Success response

```json
{
  "id": "req_01J...",
  "version": 1,
  "ok": true,
  "result": {}
}
```

### Error response

```json
{
  "id": "req_01J...",
  "version": 1,
  "ok": false,
  "error": { "code": "unsupported_version", "message": "Protocol version is not supported" }
}
```

Error `code` values are stable identifiers. Initial values are `invalid_request`, `unsupported_version`, `unauthorized`, `not_running`, `busy`, `unsupported`, and `internal`. `message` is diagnostic text and must not be used for branching.

### Methods

| Method | Params | Result | Meaning |
| --- | --- | --- | --- |
| `status` | `{}` | `Status` | Read the current daemon/tray state. Safe to poll and call on startup. |
| `pause` | `{}` | `Status` | Pause capture/processing. Idempotent when already paused. |
| `resume` | `{}` | `Status` | Resume capture/processing. Idempotent when already running. |
| `open_settings` | `{}` | `{ "target": "settings" }` | Request the client to show its settings surface. No daemon state is changed. |
| `open_models` | `{}` | `{ "target": "models" }` | Request the client to show model management. |
| `open_benchmark` | `{}` | `{ "target": "benchmark" }` | Request the client to show benchmark/history. |

The three `open_*` methods are client navigation intents. In the first shell they may be handled locally by the tray menu; retaining them in the contract lets a future daemon-driven tray use the same command names. They must not cause the daemon to spawn an arbitrary URL or process.

### `Status`

```json
{
  "daemon": "running",
  "activity": "idle",
  "paused": false,
  "profile": "basic",
  "privacy": "local_only",
  "protocol_version": 1
}
```

`daemon` is currently `starting | running | stopping | unavailable`; `activity` is `idle | listening | processing | waiting_approval | error`. `profile` and `privacy` are intentionally strings so new enum values can be added without breaking older clients. An older client must render unknown values as `unknown`, not reject the whole status response.

## Client behavior and safety

- Connect lazily on tray startup and retry with bounded backoff.
- Display `paused` and `activity` from `status`; do not infer state from whether a window is open.
- Disable pause/resume while a request is in flight, then replace local state with the returned `Status`.
- Keep settings/models/benchmark as separate windows/routes so the tray remains minimal.
- Use OS-local IPC only. Do not expose this control surface on the HTTP server or bind it to a network interface.
- Authenticate the local endpoint using the OS boundary (named-pipe ACL or socket permissions) before accepting commands.
- Log request IDs and error codes, but never audio, transcripts, or secrets.

## Blockers and exit criteria

Tauri should be introduced when these are true:

- `sorid` has a local IPC adapter and integration tests for the envelope and authorization.
- `status`, `pause`, and `resume` have real daemon state behind them.
- A Windows smoke-test environment is available for tray lifecycle, startup, and named-pipe permissions.
- Tauri/React versions and packaging/signing requirements are agreed.

Until then, this document is the implementation boundary; no generated Tauri files or platform dependencies should be committed.
