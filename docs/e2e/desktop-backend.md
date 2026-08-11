# Desktop ↔ backend E2E harness

This check starts a locally built `sorid`, verifies the CLI and the desktop
build against the same daemon, and always terminates the daemon. It does not
use a microphone, Whisper, text injection, or native Tauri packaging.

## Automated run

From the repository root:

```sh
npm install
npm run e2e:desktop-backend
```

The harness builds `sorid` and `sori` when their debug binaries are missing,
starts the daemon with a temporary database environment, waits for
`http://127.0.0.1:17373`, then runs `sori status`, `sori doctor`, and a direct
`GET /status` compatibility check before running `npm run desktop:build`.

Use another local endpoint when developing the backend:

```powershell
$env:SORI_IPC_URL = 'http://127.0.0.1:17374'
npm run e2e:desktop-backend
```

The endpoint must be local and expose the planned JSON status response
(`running: true` and numeric `protocol_version`). If the daemon has not yet
implemented the endpoint, the command prints an explicit `SKIP` mentioning
issues #47/#48/#49 and exits without masking the normal validation suite.

## Manual equivalent

```powershell
cargo build -p sorid -p sori-cli
$env:SORI_IPC_URL = 'http://127.0.0.1:17373'
$env:SORI_DB_PATH = "$PWD/.tmp/sori-manual.db"
$daemon = Start-Process .\target\debug\sorid.exe -PassThru -NoNewWindow
try {
  # Wait until the backend endpoint responds, then:
  .\target\debug\sori.exe status
  .\target\debug\sori.exe doctor
  Invoke-RestMethod "$env:SORI_IPC_URL/status"
  npm run desktop:build
} finally {
  Stop-Process -Id $daemon.Id -Force
}
```

On macOS/Linux, replace `.exe` with the binary names and stop the process
with `kill -INT <pid>`. The production IPC transport remains local-only; the
HTTP URL above is the MVP test endpoint and may be overridden during rollout.
