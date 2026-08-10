# Daemon runtime

`sorid` owns a small, platform-neutral lifecycle state machine. It starts in
`Ready` and can be paused, resumed, marked `Error`, or moved to terminal
`ShuttingDown`. Each transition publishes an event through the existing
`sori-core::EventBus` contract.

`DaemonConfig` provides defaults for the integration boundaries:

- `Ctrl+Space` hotkey binding
- 16 kHz, mono floating-point audio in 320-sample chunks
- local-first routing
- `sori.db` persistence path

The daemon currently validates and logs this configuration, waits for Ctrl+C,
and performs a graceful shutdown. Concrete audio, hotkey, IPC, and persistence
adapters are intentionally not part of this phase. Runtime transitions are
synchronous and do not block the normal dictation path.
