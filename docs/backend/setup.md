# Backend setup

## Current status

Sori's active backend is a Rust workspace. `sorid` is a lifecycle daemon with loopback IPC and SQLite persistence; the React/Tauri shell connects through the native bridge. The audio, hotkey, Whisper, and text-injection adapters are boundaries/scaffolds, not a complete dictation pipeline.

Workspace crates:

- `crates/sori-core` — domain contracts and testable runtime abstractions.
- `crates/sori-ipc` — canonical local request/response contract and transport.
- `crates/sori-persistence` — SQLite schema/store.
- `crates/sori-provider-whisper` — Whisper provider boundary/command strategy.
- `crates/sorid` — daemon runtime.
- `apps/desktop` — React/Tauri shell.

## Fresh Windows setup

Install these prerequisites before building the desktop shell or expecting a
real dictation session:

- Windows 10 1809+ (Windows 11 recommended), with a working microphone and
  microphone access enabled under **Settings > Privacy & security >
  Microphone**.
- Node.js 22+ and npm. From `apps/desktop`, run `npm ci`.
- Rust 1.85+ (stable) with the `rustfmt` and `clippy` components. Install the
  MSVC toolchain (`rustup default stable-x86_64-pc-windows-msvc`).
- Microsoft C++ Build Tools with the Windows 10/11 SDK (required by CPAL and
  Tauri's native build).
- WebView2 Runtime (normally already installed on supported Windows).
- A separately installed `whisper.cpp` CLI and a compatible model file. Sori
  does not download, vendor, or silently substitute these. Set the paths in
  `.env` (PowerShell syntax shown):

  ```powershell
  $env:SORI_WHISPER_CPP_BIN = 'C:\tools\whisper.cpp\whisper-cli.exe'
  $env:SORI_WHISPER_MODEL_DIR = 'C:\models\whisper'
  $env:SORI_WHISPER_MODEL = 'ggml-base.en.bin'
  ```

  `WHISPER_CPP_BIN` and `WHISPER_CPP_MODEL_DIR` are accepted compatibility
  aliases. `SORI_DATABASE_PATH` (or `SORI_DB_PATH`) optionally selects the
  SQLite file; otherwise the daemon uses its configured default.

The Whisper executable and model are runtime prerequisites, not Rust/npm
dependencies. Missing paths must remain visible as `unavailable` in Doctor.
Likewise, a configured CPAL adapter is not proof that a physical microphone,
Windows permission, or usable input device has been verified.

## Build and run

From the repository root:

```powershell
npm ci --prefix apps/desktop
cargo build --workspace
cargo run -p sorid
```

In a second terminal, run `cargo run -p sori-cli -- doctor`. Sori owns only
`127.0.0.1:17373`; it must never attach to an already-running unknown daemon.
If startup reports that the endpoint is occupied, inspect the owner with
`Get-NetTCPConnection -LocalPort 17373` and stop only the known stale `sorid`
process before retrying. Do not kill an unknown process.

## Validation

```sh
npm run check
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## Not complete yet

- Native Windows global hotkey.
- Windows microphone capture/VAD.
- Executing/packaged Whisper model path.
- End-to-end Windows text injection.
- Production packaging, signing, and permission recovery.

These gaps are tracked as integration work, not evidence that the daemon or shell is absent. See [MVP capability matrix](../mvp-capability-matrix.md).
