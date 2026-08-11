# Daemon runtime

`sorid` owns the platform-neutral lifecycle state machine and serves the local IPC boundary. It opens SQLite before serving requests, persists lifecycle events, and supports status/doctor/control diagnostics.

`DaemonConfig` provides defaults for the integration boundaries:

- `Ctrl+Space` intended hotkey binding;
- 16 kHz mono audio target;
- local-first routing;
- `sori.db` persistence path.

The lifecycle and contracts are implemented, but concrete Windows hotkey registration, microphone capture/VAD, Whisper execution, and text injection are not wired into an end-to-end dictation path yet. See [MVP capability matrix](../mvp-capability-matrix.md).
