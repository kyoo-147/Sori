# Reliability matrix

The executable gate is `npm run e2e:reliability`. By default it runs the
**development** `target/debug/sorid` binary. To exercise an installed daemon,
set `SORI_DAEMON_EXECUTABLE` to an existing absolute installed executable path;
the harness validates that file before launch and records `executableMode` and
`executable` in its temporary artifact. The checked-in default does not claim
installed-binary evidence.

Every run uses a random loopback port, per-run owner leases, a per-run SQLite
database, and OS temporary artifact state outside Git. It uses only the explicit
deterministic provider and `SORI_TEST_NO_OS_INJECTION=1` seam.

## Coverage

| Area | Gate evidence | Boundary |
|---|---|---|
| Status/diagnostics | 20-request p95 status latency, Doctor diagnostics, missing-model fail-closed probe | No readiness weakening |
| Transport | Stalled IPC deadline contract reference | `cargo test -p sori-ipc` remains authoritative |
| Sequential workload | 50 exact deterministic fixture transcripts | Not Whisper quality evidence |
| Session races | 20 start/cancel cycles, concurrent starts, required successful retry start+cancel | Native microphone remains separate |
| Concurrent IPC | Status/history/config/resource requests require accepted non-Error responses | Real loopback transport |
| Recording responsiveness | Five status requests during recording/stop | Native capture may remain unavailable |
| Ownership | Occupied endpoint conflict, second lease cleanup, first daemon health | Only harness-owned children are terminated |
| Journal correctness | Exact transcript, inserted text, route provenance, and required event kinds | SQLite-backed daemon journal |
| Restart recovery | Known child exit, unavailable probe, changed lease generation/PID, relaunch, exact history/resource reload | No ambiguous process discovery or kill |
| Memory | Windows tasklist working-set before/after 50 cycles | Observation/budget check, not a leak proof |
| Native boundary | Explicit UNVERIFIED microphone/model/injection and readiness observations | Never synthetic native evidence |

The broad contract gate remains:
`CARGO_BUILD_JOBS=1 cargo test --workspace -- --nocapture`.
