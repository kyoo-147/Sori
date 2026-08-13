# P0 IPC responsiveness audit

The merged native-window/hotkey baseline keeps the Tauri shell and global-hotkey
runtime in their existing files (`apps/desktop/src-tauri/src/lib.rs` and
`crates/sorid/src/hotkey.rs`). This change does not alter audio, ASR, injection,
or daemon ownership of the Rust IPC contract.

## Findings and fixes

- `sori_ipc` previously ran synchronous `LocalIpcClient` TCP I/O directly on a
  Tauri command thread. It is now an async command and runs the blocking client
  inside `tauri::async_runtime::spawn_blocking`.
- Loopback TCP now has bounded connect (500 ms), read/write (750 ms), and the
  native command has a 2 s overall request deadline.
- Debug builds emit `[sori_ipc] completed in ...` timing diagnostics without
- Native forwarding rejects work above four in-flight requests, assigns bounded
  request IDs, and exposes `sori_ipc_cancel`; cancellation is cooperative and
  the transport deadline remains the hard stop for a blocking socket worker.
  changing the response contract.
- A native Tauri runtime no longer retries the same request sequentially over
  HTTP after a daemon error. HTTP is selected directly only when native Tauri is
  unavailable (browser development).

## Deterministic coverage

`crates/sori-ipc/src/lib.rs` tests cover a stalled daemon deadline and repeated
independent requests. `tests/desktop-runtime-client.test.ts` covers native
error propagation and direct browser HTTP selection. These validate transport
responsiveness; they do not claim microphone, ASR, or focused-app output.

Validation:

- `cargo test -p sori-ipc` — 6 passed
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` — 6 passed
- `npm test -- --run tests/desktop-runtime-client.test.ts` — 8 passed
