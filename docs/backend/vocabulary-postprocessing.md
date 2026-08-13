# Vocabulary and transcript post-processing

Sori vocabulary is persisted in SQLite as the `resource.vocabulary` JSON setting. The desktop Vocabulary screen reads and writes it through the canonical `ResourceGet`/`ResourceSet` loopback IPC requests; it is not local-only UI state.

At `complete_captured_dictation_with_vocabulary`, the daemon loads the persisted terms before the ASR request. `Vocabulary::prompt()` supplies non-empty terms and pronunciation hints to the provider context. The whisper.cpp adapter passes that context to the sidecar as `--prompt`, without shell interpolation. The returned transcript then goes through `normalize_transcript` before injection and history persistence.

Normalization is intentionally conservative: explicit corrections are applied only on ASCII case-insensitive whole-token matches, terms are processed longest-first, and substrings inside identifiers are not changed. Empty terms and empty corrections are ignored. This avoids silently rewriting arbitrary prose.

## Reference and license

The provider integration targets the externally installed whisper.cpp CLI and does not vendor it. The upstream project documents `--prompt` as an initial prompt/context option: https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/README.md

whisper.cpp is MIT licensed; see the upstream license: https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE

Real microphone/Whisper transcript evidence remains environment-dependent. Unit/provider fake-runner tests verify prompt argument construction and normalization; a physical transcript is `UNVERIFIED` unless a configured executable, model, microphone, and focused target are exercised.
