# Sori architecture

## Current implementation

Sori's active product architecture is a local-first Rust daemon with a desktop shell:

```text
React/Tauri shell → loopback IPC → sorid (Rust) → SQLite
                                      ↘ lifecycle/diagnostics
```

The daemon, local IPC, SQLite persistence, and shell bridge are implemented. The Windows hotkey, microphone/audio, Whisper execution, and text injection boundaries are present as scaffolds but are not yet a complete voice path.

The older TypeScript modular monolith under `src/` remains a separate prototype/API surface and is not the desktop runtime backend.

## Runtime boundaries

- **Daemon**: owns lifecycle state and will own the voice pipeline.
- **IPC**: local-only control and diagnostics contract.
- **SQLite**: local metadata and lifecycle-event persistence.
- **Desktop**: React UI hosted by Tauri; no audio, ASR, injection, or persistence logic.
- **Adapters**: platform hotkey/audio/injection and model providers remain replaceable.

## Product direction

The intended hot path is:

```text
hold hotkey → capture audio → local ASR → transcript → safe text injection
```

Routing, context, history, dictionary, snippets, extensions, permissions, and agent actions build on this foundation. They are not all MVP-complete.

See [MVP capability matrix](mvp-capability-matrix.md) for status.
