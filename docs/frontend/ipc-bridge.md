# Frontend IPC bridge

The canonical IPC contract is Rust's `crates/sori-ipc/src/lib.rs`; its TypeScript mirror is
`apps/desktop/src/ipc-contract.ts`. Changes to serde enums or fields must update the
mirror and contract tests together. The frontend uses `src/frontend/ipc-bridge.ts`
rather than depending directly on
Rust, tray, or Tauri APIs. `RuntimeClient` exposes status, doctor, route/model
summary, pause/resume, and recent transcript views. Methods return a
`RuntimeResult` with fallback data and an error instead of blocking or throwing
when the daemon is absent.

## Adapters

- `MockRuntimeClient` is suitable for HTML/Vite preview and tests; it uses
  backend-shaped payloads so mapping remains covered without `sorid` running.
- `trayTransport` adapts the existing versioned tray protocol for status and
  pause/resume while the tray remains useful during the IPC rollout.
- `TauriCommandTransport` is a dependency-free boundary for a future Tauri
  `invoke` implementation. Its default command is `sori_ipc` and it sends an
  operation plus bounded parameters.

The mapper accepts Rust `serde` externally tagged responses (`Status`,
`Doctor`, `ConfigSummary`, `RecentEvents`, and `Control`) and the existing tray status shape.
It converts these into UI-safe view models, including transcript events only
when a text field is present.

## Integration sequence

1. Select `TauriCommandTransport` in the desktop shell and construct one
   `RuntimeClient` per UI session.
2. Load status and summary independently on screen mount; render loading,
   unavailable, and stale/fallback states without awaiting the daemon before
   showing the shell.
3. Refresh doctor and recent transcripts on demand, respecting the configured
   local retention policy.
4. Add the production named-pipe/Unix-socket transport behind the Rust
   `sori-ipc::Transport` contract. Keep the endpoint per-user and local-only;
   do not send microphone bytes, secrets, or credentials through this bridge.
5. Extend the Rust request enum with pause/resume and route/model fields when
   those daemon contracts are ready. The frontend adapter already has the
   stable operation boundary and treats additional fields as optional.

No network fallback is provided: preview fallback is local mock data only.
