# Daemon runtime

`sorid` owns the platform-neutral lifecycle state machine and serves the local IPC boundary. It opens SQLite before serving requests, persists lifecycle events, and supports status/doctor/control diagnostics.

`DaemonConfig` provides defaults for the integration boundaries:

- `Alt+Space` Windows global hotkey binding;
- 16 kHz mono audio target;
- local-first routing;
- `sori.db` persistence path.

The daemon registers the Windows hotkey on a worker-owned message loop and reports conflicts/unsupported platforms through Doctor. Microphone capture/VAD, Whisper execution, and text injection are not yet wired into an end-to-end dictation path. See [MVP capability matrix](../mvp-capability-matrix.md).
