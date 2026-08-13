# CLI runtime delivery report

## Scope

PR #106 adds `sori run`, `doctor`, `status`, `models`, `benchmark`,
`extensions`, `history`, `dictionary`, `permissions`, and `context` in
`crates/sori-cli`. Product commands use `LocalIpcClient` and the canonical
`sori-ipc::Request`/`Response` contract. The CLI does not read desktop fixtures,
maintain a second store, or print fabricated runtime success.

Resource commands currently read daemon-owned resources through
`Request::ResourceGet`; mutation commands are intentionally not exposed until
matching IPC contracts exist. `sori run` uses `DictationStart` followed by
`DictationStop` and prints a transcript only when the daemon returns one.

## Evidence

- `cargo fmt --all -- --check` — passed.
- `cargo test -p sori-cli -p sori-ipc` — passed; 3 CLI tests and 6 IPC tests.
- `cargo test --workspace` — passed, including
  `canonical_ipc_exercises_success_cancellation_and_injection_fallback`.
- CLI tests cover command parsing, MockIpcServer resource routing, and the
  absence of local/fake resource output.
- Commit: `1363bde` (`feat(cli): route runtime commands through daemon IPC`).
- Direct PR: https://github.com/kyoo-147/Sori/pull/106

## Native and hardware boundary

This report does **not** claim native voice readiness. The CLI is verified as a
loopback IPC client and the workspace tests use deterministic seams. A real
`SORI` session still requires a running, intended `sorid` process, a working
Windows CPAL input device, configured global hotkey, real Whisper executable and
model, and foreground-app injection. Physical microphone capture, hotkey
press/release, Whisper inference with user hardware, and focused-app text
insertion were not exercised here and remain `UNVERIFIED`/`SKIP` until native
machine evidence is captured. The CLI cannot turn an unavailable daemon or
failed Doctor check into success; those paths exit non-zero.

## Delivery state

Branch `feat/cli-runtime-commands` is pushed to `origin` and PR #106 is open.
The working tree is clean after the report commit.
