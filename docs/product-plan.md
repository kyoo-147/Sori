# Sori product plan

## Product thesis

Sori is a local-first programmable voice runtime for desktop. The first useful path is Windows dictation: hold a hotkey, speak, transcribe locally, and insert text into the focused app. The long-term product adds programmable routing, voice editing, snippets, harnesses, and permissioned actions without making normal dictation depend on an agent.

## Current MVP truth

The repository already has the Rust daemon (`sorid`), loopback IPC, SQLite persistence, and a React/Tauri shell. These are working architectural boundaries and diagnostics surfaces. The real hotkey, microphone, Whisper, and text-injection path is not complete, so the product is not yet an install-to-dictation release.

## MVP sequence

1. Prove daemon/IPC/SQLite lifecycle and diagnostics.
2. Integrate Windows hotkey and microphone capture.
3. Run a local Whisper provider.
4. Insert or copy transcript text safely into the focused app.
5. Validate first-run permissions and the complete path on Windows.

## Later direction

- Provider abstraction, model manager, benchmark, and routing.
- Context-aware dictation and voice edit.
- History, dictionary, snippets, and retention controls.
- Permissioned harnesses, tools, extensions, and agent actions.
- Optional TTS and voice identity.
- macOS second; Linux later with explicit X11/Wayland limitations.

See the [MVP capability matrix](mvp-capability-matrix.md) for implementation status; product screens and contracts are not claims of completed runtime behavior.
