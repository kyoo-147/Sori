# Sori implementation schedule

This schedule reflects the current Rust daemon + desktop-shell MVP. It separates implemented deterministic/contract/runtime paths from the physical Windows evidence still required for release confidence.

## Done / implemented

- Rust workspace with `sorid`, core contracts, CLI, IPC, provider, audio, and injection boundaries.
- `sorid` lifecycle runtime and loopback IPC contract/transport.
- SQLite migration and lifecycle-event persistence.
- React/Tauri desktop shell with native IPC bridge and browser/mock fallback.
- Windows global hotkey registration, hold/release state handling, conflict/recovery behavior, and daemon service wiring.
- CPAL microphone capture lifecycle, device/configuration checks, sample conversion, chunk delivery, VAD events, cancellation, and restart-safe cleanup.
- External whisper.cpp provider discovery/configuration, temporary WAV execution, output parsing, prerequisite/process failure reporting, and cleanup.
- Windows text-injection planning/target validation and SendInput adapter outcomes, including explicit unsupported/failure states.
- Daemon dictation path connecting hotkey → microphone/VAD → Whisper → injection → SQLite/events/frontend boundaries.
- Desktop status/doctor surfaces and deterministic contract/fake-boundary tests.

## Physical Windows acceptance still required

These are validation work, not a reason to describe the implemented software boundaries as scaffolds:

1. Grant microphone/input permissions and start a real Windows input device.
2. Hold and release the configured global hotkey on the target machine.
3. Speak real audio through a configured whisper.cpp executable and valid model.
4. Insert the resulting transcript into a safe focused application, including blocked/elevated-target behavior.
5. Confirm the resulting transcript/events are persisted and reflected by the native shell.
6. Validate installed tray lifecycle, installer/package behavior, and signing.

Until this controlled run is observed, microphone permissions, real speech, physical global-hotkey delivery, focused-app insertion, installer behavior, and signing remain `UNVERIFIED`. Fake devices/runners/targets and UI/IPC checks do not substitute for that evidence.

## Deferred after the first working path

Model routing/benchmarking, voice edit, dictionary/snippets, extensions/agent actions, TTS, and macOS/Linux production support remain product direction rather than current MVP commitments.

For the status of each boundary, see [MVP capability matrix](mvp-capability-matrix.md).
