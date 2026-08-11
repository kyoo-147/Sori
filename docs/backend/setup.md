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

## Local prerequisites

- Node.js 22+.
- Rust stable with `rustfmt` and `clippy`.

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
