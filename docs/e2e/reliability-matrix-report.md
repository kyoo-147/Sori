# Worker K standalone report — Windows E2E/performance/reliability

**Status:** complete  
**PR:** #103 — https://github.com/kyoo-147/Sori/pull/103  
**Commit:** `a3fd0d8` (`test(e2e): add Windows reliability matrix`)

## Scope

The reliability harness uses the real `target/debug/sorid` process and canonical
loopback IPC at `127.0.0.1:17373`. It owns the endpoint, refuses a stale/existing
daemon, uses a per-run SQLite database, and cleans up its daemon. Generated
evidence is `.tmp/e2e-matrix/reliability-matrix.json` with `review: pending`.

## Run evidence

Command:

```text
npx --yes tsx scripts/e2e-reliability.ts
```

Observed run:

- Status latency: **PASS**, 20 real IPC requests, p95 **3 ms**.
- Doctor diagnostics: **PASS**, real daemon response in **25 ms**.
- Repeated start/cancel: **PASS**, 5/5 real `sorid` request cycles accepted.
- Working-set observation: **PASS**, **13,876 KB → 14,588 KB** after five cycles; this is not a leak proof.
- Concurrent status during stop: **PASS**, status **668 ms**, stop **668 ms**.
- Daemon restart with same SQLite database: **PASS**, status returned in **1 ms**.
- Stalled IPC deadline: **PASS** through the deterministic `sori-ipc` contract test.
- Crash recovery: **SKIP**; the safe harness does not kill arbitrary processes.

Artifact SHA-256 from this run:

```text
697956afaf9b6854184255544358b59ecffdce4e35d8bdf995d94ae30d9c8524
```

## Validation

- `cargo fmt --all -- --check` — passed.
- `cargo test -p sori-ipc -- --nocapture` — 6 passed.
- `cargo test -p sorid --test backend_ipc_e2e -- --nocapture` — 1 passed.
- `cargo test --workspace -- --nocapture` — passed; real Whisper fixture smoke is ignored without installed prerequisites.
- Frontend Vitest run was blocked because dependencies are not installed in this checkout (`vitest` not recognized).

## Native/hardware boundary

This report does **not** claim verified physical microphone capture, Whisper
inference, focused-app targeting, Windows text injection, or hotkey-to-dictation
success. The repeated cycles prove real daemon/IPC lifecycle handling only;
physical capture remains **UNVERIFIED** unless a permitted device produces
inspectable audio, the configured model produces a transcript, and native
injection is observed in a verified foreground target. The backend E2E fakes are
limited to capture/provider/injector contract seams and are not native proof.
