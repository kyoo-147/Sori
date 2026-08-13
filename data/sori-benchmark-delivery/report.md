# Benchmark delivery report

## Scope

Implemented a provider-backed benchmark path across the Rust core, loopback IPC,
SQLite persistence, CLI, and desktop benchmark surface. The implementation replaces
UI timer/rehearsal success with canonical provider calls and explicit unavailable
boundaries.

## Changed surfaces

- `crates/sori-core/src/benchmark.rs`: runner, percentiles, cold/warm timing, RTF,
  failure rate, optional WER/CER edit distance, deterministic tests.
- `crates/sori-ipc/src/lib.rs`: `RunBenchmark`, `RecentBenchmarks`, and
  `ApplyBenchmarkRecommendation` contracts plus benchmark response.
- `crates/sori-persistence/src/migrations/001_initial.sql` and `src/lib.rs`:
  persisted benchmark runs and retrieval.
- `crates/sorid/src/main.rs`: provider execution, persistence, and recommendation route
  persistence; unavailable provider returns an IPC error.
- `crates/sori-cli/src/main.rs`: `sori benchmark --model ... --audio ...` for mono
  PCM16 WAV input, optional reference, and iterations.
- `apps/desktop/src/*`: IPC mirror/client and benchmark UI no longer claims timer
  metrics; persisted results are hydrated and route application uses IPC.
- `docs/backend/benchmark-routing.md`: usage, dataset boundary, reference/license
  research, and validation policy.

## Verification evidence

- `cargo check --workspace` — PASS.
- `cargo test -p sori-core -p sori-persistence -p sori-ipc -p sorid` — PASS;
  27 core, 6 IPC, 5 persistence, 9 sorid tests including the backend IPC E2E.
- `npm run desktop:check` — PASS.
- `cargo fmt --all` — PASS.
- `git diff --check` — PASS.

## Native/hardware boundary

No native microphone, CPAL stream session, Whisper inference, model load, physical
hotkey, focused-window injection, RAM/VRAM telemetry, or real WER/CER dataset result
was verified in this environment. Those remain `UNVERIFIED/SKIP` unless the intended
Windows `sorid`, Whisper executable/model, mono PCM16 fixture, and reference transcript
are supplied and run. Deterministic provider tests prove runner math and contracts only;
they are not local hardware evidence. The desktop action truthfully says `Needs Wiring`
when no real audio fixture is selected.

Reference implementation research used whisper.cpp's MIT-licensed `whisper-bench` and
`bench.py`, plus faster-whisper's MIT-licensed benchmark methodology. See the linked
sources in `docs/backend/benchmark-routing.md`.
