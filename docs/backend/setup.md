# Backend setup

## Current status

The first backend foundation is a Rust workspace that introduces the Sori runtime boundaries without wiring platform-specific audio, hotkey, IPC, model, or injection adapters yet.

Workspace crates:

- `crates/sori-core` — core domain contracts and testable hot-path abstractions.
- `crates/sori-cli` — `sori` CLI scaffold for status/doctor/context.
- `crates/sorid` — daemon scaffold.

## Local prerequisites

Required now:

- Node.js 22+ for the existing TypeScript scaffold.
- Rust stable toolchain with `rustfmt` and `clippy`.

Installed locally during this setup:

- Rustup via `winget install --id Rustlang.Rustup -e --source winget`.

If Rust is missing on a new machine:

```sh
winget install --id Rustlang.Rustup -e --source winget
rustup toolchain install stable
rustup component add rustfmt clippy
```

## Validation

```sh
npm run check
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## What is not wired yet

These are next implementation tracks, not blockers for the current scaffold:

- Windows hotkey adapter.
- Windows audio capture adapter.
- Text injection adapter.
- Local IPC transport.
- SQLite persistence.
- `whisper.cpp` provider.
- Tray/Tauri client. See [Tray/Tauri client](tray-tauri.md) for the staged plan and IPC contract.

## Captain action required

None right now. Rust was installed locally and the repo can proceed without additional credentials/configuration.

Future captain actions may be needed for:

- Windows microphone/input/accessibility permissions during manual testing.
- Code signing credentials when distributing an installer.
- BYOK/cloud provider keys when cloud fallback is introduced.
