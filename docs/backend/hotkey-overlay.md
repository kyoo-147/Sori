# Windows hotkey and overlay trigger

The daemon's Windows listener in `sorid::hotkey` uses the authoritative
`sori-core::hotkey` registration and hold-to-talk state machine:

- `HotkeyBackend` owns platform registration lifecycle.
- `HotkeyStateMachine` converts native pressed/released/cancelled notifications
  into one-shot `HotkeyEvent` values and publishes `EventKind::HotkeyPressed`,
  `HotkeyReleased`, or `HotkeyCancelled`.
- Repeated press notifications and stale release/cancel notifications are
  ignored. Cancellation always returns a held session to `Idle`.
- `WindowsHotkeyBackend` owns a safe `RegisterHotKey`/`UnregisterHotKey`
  boundary. A registration conflict retries once with the deterministic
  `Ctrl+Alt+Space` fallback; the active combination is then used for release
  polling. `HotkeyBackend::recover` re-registers and resets held state after a
  stale listener. `sorid` runs its message pump on a worker thread, translates
  matching `WM_HOTKEY` payloads, polls key state for release, and unregisters
  during shutdown.
- `FakeHotkeyBackend` and `FakeHotkeyRegistration` provide deterministic tests
  without OS hooks. Non-Windows builds use `UnsupportedHotkeyBackend`.

## Manual Windows testing

1. Build on Windows with `cargo test --workspace`; use a temporary
   `HotkeyCombination` (for example Ctrl+Shift+Space) in the host process.
2. Start the backend and verify registration succeeds. If another application
   owns the combination, startup must return `HotkeyError::Conflict` without
   claiming the hotkey.
3. Run the host's message loop and forward `WM_HOTKEY` as `Pressed`; forward
   `Released` when the combination is no longer held. Confirm repeats produce
   no duplicate press and release produces one event.
4. On focus loss or shutdown, forward `Cancelled`, then call `stop`; verify a
   later notification is ignored and the registration is released.
5. The daemon Doctor response reports registration, conflict, unsupported, and
   other native failures explicitly. A successful registration is not physical
   key proof; verify the key on a real Windows desktop separately.
