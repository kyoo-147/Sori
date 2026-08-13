# Windows reliability matrix

The authoritative harness is `npm run e2e:reliability`. It launches the real
`target/debug/sorid` daemon on the canonical loopback endpoint, refuses an
already-owned endpoint, records JSON evidence in
`.tmp/e2e-matrix/reliability-matrix.json`, and cleans up its own daemon.

## Matrix

| Area | Harness evidence | Boundary |
|---|---|---|
| Status latency | 20 real IPC requests, p95 | threshold is 750 ms |
| Blocking/stalled IPC | `cargo test -p sori-ipc`, stalled-daemon deadline test | deterministic transport seam, not fake UI success |
| Status while recording | concurrent real `Status` during `DictationStop` | microphone/model availability is reported separately |
| Repeated dictation | five real start/cancel cycles | `UNVERIFIED` if the device is unavailable |
| Memory growth | Windows `tasklist` working-set samples before/after cycles | observation only, not a leak proof |
| Restart/recovery | stop and relaunch `sorid` against the same SQLite database | process restart, not forced crash |
| Device/model/injection | real `Doctor` plus dictation response | physical microphone, Whisper model, and focused-app injection remain `UNVERIFIED` unless separately proven |
| Crash recovery | explicit `SKIP` in the safe harness | manually kill only the test-owned daemon, then rerun restart |

The canonical backend contract seam remains
`cargo test -p sorid --test backend_ipc_e2e -- --nocapture`; its fakes are
restricted to capture/provider/injector interfaces and are labeled as such.
Do not interpret passing contract tests as microphone, ASR, or native injection
proof.

## Current baseline evidence

- `cargo test -p sori-ipc -- --nocapture`: 6 passed.
- `cargo test -p sorid --test backend_ipc_e2e -- --nocapture`: 1 passed.
- `cargo test --workspace -- --nocapture`: passed; Whisper fixture smoke is ignored because it requires an installed binary/model.
- `npm test -- --run tests/e2e-desktop-backend.test.ts`: blocked on this checkout because `vitest` is not installed (`'vitest' is not recognized`).
- Native microphone/model/injection evidence was not claimed by this worker.
