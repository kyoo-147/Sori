# Voice Edit boundary

Voice Edit is a review-first operation, not a timer or presentation mock:

1. a selection snapshot must include non-empty text and a target identity;
2. the instruction is captured through canonical `DictationStart`/`DictationStop` IPC or entered explicitly;
3. sorid transforms only supported operations, generates a diff, and returns an unapplied preview;
4. approval revalidates the target identity before invoking the canonical `TextInjector`.

The MVP rule transformer supports `trim whitespace`, `uppercase`, and `lowercase`. Semantic edits require a provider implementing the voice-edit transformer boundary; they return `unsupported` rather than claiming success.

Browser selection is useful contract evidence only. Native focused-app selection detection and target identity are **UNAVAILABLE/UNVERIFIED** until a Windows selection provider is connected. Mock transports explicitly reject Voice Edit. No screenshot, timer, or local state is treated as replacement evidence.

The implementation uses serde types from `crates/sori-core/src/voice_edit.rs` and the canonical `VoiceEdit` IPC request in `crates/sori-ipc/src/lib.rs`.

## References and licensing

- Whisper instruction capture follows the repository's existing whisper.cpp boundary; whisper.cpp is MIT licensed: https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE
- The review output is intentionally modeled on unified diff semantics documented by GNU Diffutils: https://www.gnu.org/software/diffutils/manual/html_node/Unified-Format.html

These links are references only; no third-party source was copied into Sori.
