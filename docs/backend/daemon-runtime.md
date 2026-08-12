# Daemon runtime

`sorid` owns the platform-neutral lifecycle state machine and serves the local IPC boundary. It opens SQLite before serving requests, persists lifecycle events, and supports status/doctor/control diagnostics.

`DaemonConfig` provides defaults for the integration boundaries:

- `Ctrl+Space` intended hotkey binding;
- 16 kHz mono audio target;
- local-first routing;
- `sori.db` persistence path.

The daemon now wires captured audio into the configured whisper.cpp provider on `DictationStop`. A transcript is returned only after the sidecar exits successfully and its output parses; missing executable/model, capture errors, non-zero exits, timeouts, cancellation, and empty output remain errors. Native Windows hotkey registration and text injection are still separate seams. See [MVP capability matrix](../mvp-capability-matrix.md).
