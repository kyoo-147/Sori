# Dictation pipeline smoke path

The phase-two hot path is now represented by `sori_core::run_dictation`:

1. A trigger is received (`HotkeyPressed`).
2. An `AudioEngine` supplies chunks until it returns `None`.
3. The selected `ModelProvider` transcribes the chunks.
4. The transcript is sent directly to a `TextInjector` (no LLM, agent, or extension).
5. A `HistoryEntry` is written and stage events are published through the supplied boundaries.

The CLI smoke command uses fakes and has no microphone, Whisper installation, or OS
injection requirement:

```text
cargo run -p sori-cli -- smoke dictation
```

An injection failure does not discard the transcript. The history entry is persisted
with `inserted_text = None`, an error is returned in the smoke result, and a fallback
event is emitted. A UI/daemon can use that record to offer copy/retry behavior.

## Remaining concrete backend gaps

- A Windows hotkey/audio capture adapter is still needed.
- DSP and production VAD are contracts/stubs only.
- `WhisperCppProvider` still needs process supervision, audio encoding, cancellation,
  and output parsing.
- Windows `SendInput`/clipboard adapter and active-target capability discovery remain
  unimplemented.
- The daemon IPC boundary is not yet connected to this orchestrator.
- SQLite already implements history and events, but production retention and error
  reporting policy still need to be decided.
