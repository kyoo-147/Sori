# Sequential product E2E gate

Run from the repository root:

```sh
npm install
npm --prefix apps/desktop install
npm run e2e:product
```

The gate keeps one real `sorid` process, one temporary SQLite database, one
Vite desktop surface, and one semantic Chrome page alive for the entire flow.
It verifies, in order:

1. loopback IPC status is served by the real daemon and the desktop reports
   `Backend` rather than `Mock fallback`;
2. a desktop preference survives a browser reload;
3. every primary desktop route renders its expected semantic heading/content;
4. transcript empty, loading, error, and retry states;
5. the explicit `DELETE` destructive confirmation and empty post-delete state;
6. diagnostics actions that are not wired report no side effect.

Browser operations use `chrome-devtools-axi` accessibility snapshots and
semantic button/textbox references. A failure stores the error and final
snapshot under `.tmp/e2e-product-gate/<pid>/`.

The gate does not claim voice success. Global hotkey, physical microphone
capture, Whisper model inference, and focused-app text injection are printed
as an explicit `SKIP: UNVERIFIED` hardware/external path because they require
separate machine-level validation. If Chrome or `chrome-devtools-axi` is not
available, the semantic desktop portion also exits with an explicit
`SKIP: UNVERIFIED`; real daemon checks never use a mock fallback.

The harness refuses to run against an already-owned IPC endpoint. Override the
endpoint or web port for an isolated run:

```powershell
$env:SORI_IPC_URL = 'http://127.0.0.1:17374/ipc'
$env:SORI_E2E_WEB_PORT = '4174'
npm run e2e:product
```

## Full product acceptance

`npm run e2e:full-product` is the ownership-safe backend acceptance gate for
the launch brief. It refuses an already-owned loopback endpoint, starts only
the `sorid` binary it owns, uses a process-unique SQLite database, and verifies
launch/reconnect, models and route validation, dictation lifecycle, benchmark
timeout/retry/cancel boundaries, history/settings/vocabulary/snippets
persistence, concurrent IPC, error recovery, daemon restart, and SQLite reopen.
It reports native microphone, hotkey, Whisper, and focused-app injection as
`UNVERIFIED`; deterministic fixtures are never native evidence.

```sh
cargo build -p sorid
npm run e2e:full-product
```

The gate fails only on contract, persistence, ownership, or recovery regressions;
host-dependent voice/provider gaps are explicit `UNVERIFIED`/`SKIP` outcomes.
The gate fails only on contract, persistence, ownership, or recovery regressions;
host-dependent voice/provider gaps are explicit `UNVERIFIED`/`SKIP` outcomes.
It writes the exact result to `.tmp/e2e-full-product/evidence.json`.
