# Windows hotkey and overlay trigger

The core scaffold in `sori-core::hotkey` separates native registration from the
hold-to-talk state machine:

- `HotkeyBackend` owns platform registration lifecycle.
- `HotkeyStateMachine` converts native pressed/released/cancelled notifications
  into one-shot `HotkeyEvent` values and publishes `EventKind::HotkeyPressed`,
  `HotkeyReleased`, or `HotkeyCancelled`.
- Repeated press notifications and stale release/cancel notifications are
  ignored. Cancellation always returns a held session to `Idle`.
- `WindowsHotkeyBackend` is a deliberately safe `RegisterHotKey` placeholder;
  it currently returns `Unsupported` until a Windows message-loop adapter is
  manually tested. Non-Windows builds use `UnsupportedHotkeyBackend`.

## Manual Windows follow-up

1. Select the desired modifier/key and register it through the eventual native
   adapter.
2. Verify press starts one session, key repeat does not duplicate it, and
   release emits exactly one release event.
3. Verify focus loss, backend shutdown, and registration conflicts emit
   `HotkeyCancelled` and leave the state idle.
4. Check conflicts with existing global shortcuts and document the fallback.
5. Connect the overlay to the hotkey events; UI polish is intentionally out of
   scope for this scaffold.
