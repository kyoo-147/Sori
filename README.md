<p align="center">
  <img src="docs/assets/sori-familiar.png" alt="A serpentine Sori familiar, drawn as a dragon, fish, and horse hybrid" width="180">
</p>

<h1 align="center">Sori</h1>

<p align="center"><strong>A local-first programmable voice runtime for the desktop.</strong></p>

> Sori is an early Windows-first desktop MVP foundation. It is not yet a verified, end-to-end voice-typing product.

## Why Sori exists

Voice software should be useful without requiring a cloud account, an opaque hosted workflow, or an always-open application. Sori is being built around a short hot path—**hold a key, speak, produce useful text**—with deeper controls available to people who want them.

The project currently prioritizes a trustworthy foundation over a polished promise:

- **Local first:** the active runtime, loopback transport, and SQLite state are designed to run on the user's machine.
- **Fast path first:** ordinary dictation should not depend on an agent or an LLM.
- **Progressive disclosure:** a small desktop surface for everyday use; diagnostics, models, profiles, and extensions for advanced users.
- **Fail honestly:** a contract, mock, fixture, or rendered screen is not proof of a physical microphone, model inference, or focused-app insertion.

## What works today

The following repository capabilities are implemented and covered by code-level tests:

- Rust `sorid` daemon with lifecycle state and diagnostics.
- Local-only HTTP/JSON IPC on `127.0.0.1:17373`.
- SQLite migration and persistence for lifecycle/recent-event data.
- React/Tauri desktop shell and native bridge, with browser development fallbacks.
- CLI status/doctor controls (`sori-cli`).
- Capability-aware diagnostics that expose unavailable prerequisites instead of claiming success.

The voice path is deliberately not overstated. Hotkey capture, physical microphone/VAD, executing Whisper inference, and focused-application text injection remain scaffolds or environment-dependent seams. A complete **hotkey → microphone → ASR → injection → history** session is still `UNVERIFIED`; see the [capability matrix](docs/mvp-capability-matrix.md) and [native voice evidence](docs/e2e/native-voice-e2e-2026-08-13.md).

## How it works

```text
React/Tauri shell ── native bridge ── loopback IPC ── sorid (Rust) ── SQLite
```

The workspace is split into small boundaries:

- `crates/sori-core` — domain contracts and runtime abstractions.
- `crates/sori-ipc` — the canonical local request/response transport.
- `crates/sori-persistence` — SQLite schema and store.
- `crates/sori-provider-whisper` — the Whisper command/provider boundary.
- `crates/sori-audio` — audio contracts and capture boundary.
- `crates/sorid` — daemon runtime.
- `crates/sori-cli` — command-line diagnostics and controls.
- `apps/desktop` — React/Tauri client.

The daemon is authoritative for runtime state. The desktop client does not turn simulated UI state into runtime evidence.

## Prerequisites

The supported development target is Windows 10 1809+ (Windows 11 recommended).

- Node.js 22+ and npm.
- Rust 1.85+ with the MSVC toolchain, `rustfmt`, and `clippy`.
- Microsoft C++ Build Tools and the Windows SDK for native builds.
- WebView2 Runtime for the Tauri shell.
- For a real Whisper-provider attempt: a separately installed `whisper.cpp` executable and compatible model. Sori does not download or vendor these artifacts.

The current repository can be built and tested on other hosts where the Rust/Node dependencies support them, but Windows-only hotkey, audio, and input behavior is not thereby verified.

## Quickstart

From the repository root, install the desktop dependencies and build the workspace:

```powershell
npm ci --prefix apps/desktop
cargo build --workspace
```

Start the local daemon:

```powershell
cargo run -p sorid
```

In a second terminal, inspect its local health and capability state:

```powershell
cargo run -p sori-cli -- doctor
cargo run -p sori-cli -- status
```

The daemon owns only `127.0.0.1:17373`. If startup reports that the endpoint is occupied, inspect it with `Get-NetTCPConnection -LocalPort 17373` and stop only a known stale `sorid` process. Never kill an unknown owner.

To run the frontend development shell separately:

```powershell
npm run desktop:dev
```

A real Whisper configuration uses explicit paths (PowerShell):

```powershell
$env:SORI_WHISPER_CPP_BIN = 'C:\tools\whisper.cpp\whisper-cli.exe'
$env:SORI_WHISPER_MODEL_DIR = 'C:\models\whisper'
$env:SORI_WHISPER_MODEL = 'ggml-base.en.bin'
```

Missing executable/model paths should remain `unavailable` in Doctor. Configuration alone is not physical microphone or dictation proof.

## Verification

Inspect scripts before running them; the repository's CI-equivalent checks are:

```powershell
npm ci
npm run check
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

The focused backend and desktop checks are also available:

```powershell
npm run e2e:backend-ipc
npm run e2e:desktop-backend
npm run e2e:product
```

The E2E harnesses provide deterministic or daemon-backed contract evidence. Hardware-dependent results must still be recorded as `UNVERIFIED` or `SKIP` unless a real Windows session observes them.

## Platform boundaries

Sori is Windows-first. The current repository contains portable Rust and web contracts, but does not claim production support for macOS or Linux. The following remain incomplete or require machine-level validation:

- global hold-to-talk hotkey;
- microphone capture, permissions, and VAD;
- packaged/executing Whisper model path;
- focused-app text injection;
- production packaging, signing, and permission recovery;
- routing, benchmark, voice edit, extensions, and TTS as complete product features.

For implementation detail, see the [architecture notes](docs/architecture.md), [backend setup](docs/backend/setup.md), and [dictation pipeline](docs/dictation-pipeline.md).

## Contributing and security

This repository is in an early MVP phase. Start with the issue tracker and the existing tests, and keep claims aligned with the [capability matrix](docs/mvp-capability-matrix.md). Do not submit credentials, model files, recordings, or local databases.

There is currently no tracked `LICENSE`, `SECURITY.md`, or `CONTRIBUTING.md` file in this checkout; no license or security contact is asserted here. The Rust workspace declares MIT metadata, but that metadata is not a substitute for a repository license file.
