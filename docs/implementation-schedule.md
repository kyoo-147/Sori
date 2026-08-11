# Sori implementation schedule

This schedule reflects the current Rust daemon + desktop-shell MVP. It separates shipped boundaries from the work required for first real dictation.

## Done / implemented

- Rust workspace with `sorid`, core contracts, CLI, IPC, provider, audio, and injection boundaries.
- `sorid` lifecycle runtime and loopback IPC contract/transport.
- SQLite migration and lifecycle-event persistence.
- React/Tauri desktop shell with native IPC bridge and browser/mock fallback.
- Desktop status/doctor surfaces and deterministic tests.

## Scaffold / next integration queue

1. Wire a Windows global hold-to-talk hotkey into `sorid`.
2. Add Windows microphone capture, VAD, and permission/error reporting.
3. Execute the Whisper provider against a packaged or explicitly configured model.
4. Connect transcript output to the Windows text-injection adapter, including blocked-app fallback.
5. Run an end-to-end Windows smoke test: hotkey → audio → ASR → injection → SQLite history.
6. Harden tray lifecycle, permissions, packaging, signing, and recovery behavior.

## Deferred after the first working path

Model routing/benchmarking, voice edit, dictionary/snippets, extensions/agent actions, TTS, and macOS/Linux production support remain product direction rather than current MVP commitments.

For the status of each boundary, see [MVP capability matrix](mvp-capability-matrix.md).
