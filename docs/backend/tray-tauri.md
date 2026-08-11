# Tray/Tauri client

## Current decision

The Tauri v2 + React desktop shell now exists in `apps/desktop`. It is a thin client: it renders product surfaces and forwards canonical IPC requests through the native `sori_ipc` command. Audio, ASR, injection, and persistence remain daemon responsibilities.

## Current implementation

- Tauri command bridge forwards requests to the loopback `sorid` endpoint.
- React uses native IPC first, then an HTTP development fallback, then mock preview data outside a connected runtime.
- Status, doctor, pause, resume, and recent-event-oriented diagnostics are represented in the shell.
- Native packaging, signing, and platform permission setup are not complete.

The browser/mock path is useful for UI development but must not be mistaken for a working voice runtime.

## IPC boundary

The canonical request/response envelope and operation names live in `crates/sori-ipc` and are mirrored by `apps/desktop/src/ipc-contract.ts`. Keep IPC local-only; do not turn the control surface into a public HTTP endpoint.

## Next work

1. Wire the daemon's Windows hotkey and microphone adapters.
2. Connect Whisper execution and text injection behind the existing daemon boundaries.
3. Add Windows smoke tests for the complete path and permission failures.
4. Add tray lifecycle, packaging, signing, and installer behavior.

See [MVP capability matrix](../mvp-capability-matrix.md).