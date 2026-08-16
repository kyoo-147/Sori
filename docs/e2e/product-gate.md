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

## Model readiness/import acceptance

The model gate is fail-closed and user-owned: Sori never downloads or bundles
whisper.cpp or model weights. `Models` must expose the configured provider,
executable/model-directory paths, and only artifacts that exist below the
configured directory. Each discovered/imported manifest reports its SHA-256,
source path/provenance, and declared license; an undeclared license remains
explicitly `Not declared (user-supplied artifact)`.

Acceptance evidence must include: (1) missing executable or model assets remain
`available=false`/`UNAVAILABLE` and cannot load, warm, or transcribe; (2) a
real user-supplied artifact with a matching 64-character SHA-256 is imported
atomically; and (3) its manifest, checksum, source, and license survive SQLite
close/reopen. A checksum mismatch or provider-unavailable response is a hard
failure, not a fallback or synthetic model.
