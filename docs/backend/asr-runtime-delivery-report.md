# ASR runtime/model delivery report

Date: 2026-08-14
Branch: `fm/product-ws-c-whisper-native-runtime`
PR: https://github.com/kyoo-147/Sori/pull/134
Commit: `c550fdf`

## Delivered

- Added the canonical duplicate-safe `ModelProviderRegistry` in
  `crates/sori-core/src/model.rs`; providers remain behind `ModelProvider`.
- Added truthful Whisper lifecycle operations in
  `crates/sori-provider-whisper/src/lib.rs`: discovery, checksum-verified
  installation, `load`, `warm`, `unload`, and `remove_model`.
- Preserved direct `Command` invocation, model-directory containment checks,
  timeout/cancellation handling, output parsing, temporary-file cleanup, and
  explicit missing-prerequisite failures.
- Hardened process-spec resolution so configured model paths are verified
  through canonical model-directory containment before sidecar launch, while
  preserving manifest-backed fake-runner seams for deterministic tests.
- Added deterministic registry and lifecycle tests.
- Documented upstream patterns, license evidence, and the packaging boundary in
  `docs/backend/whisper-provider.md`.

## Verification evidence

Commands run from the repository root:

- `cargo fmt --all --check` — PASS
- `cargo test -p sori-provider-whisper` — PASS: 17 passed, 1 real Whisper
  fixture test is intentionally ignored because prerequisites were absent.
- `cargo check -p sorid` — PASS
- `git diff --check` — PASS
- `git status --short --branch` — PASS after commit; branch pushed for PR #134

The explicit real-process gate is
`cargo test -p sori-provider-whisper real_fixture_transcription_smoke -- --ignored`.
It requires `SORI_WHISPER_CPP_BIN`, `SORI_WHISPER_MODEL_DIR`,
`SORI_WHISPER_MODEL`, and `SORI_WHISPER_FIXTURE_WAV`.

## Native/hardware boundary

Native local inference is **UNVERIFIED/SKIP** in this environment: no real
`whisper-cli` executable, model weights, or fixture WAV were available. The
provider and fake-runner tests do not prove Whisper inference from a physical
microphone. They also do not prove Windows microphone permission/device capture,
global hotkey delivery, GPU backend behavior, focused-window selection, or
text injection. Those require a target-machine native/manual run and must remain
explicitly unclaimed until observed.

Sori does not vendor native binaries or model weights. The remaining packaging
boundary is to ship or acquire a reviewed, architecture-matched whisper.cpp
executable and separately licensed/checksummed model artifacts through the
release installer/model manager. Until then, configuration remains via PATH,
environment variables, or the restart-persistent user config.

## License research evidence

- whisper.cpp repository license: MIT —
  https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE
- OpenAI Whisper repository license: MIT —
  https://github.com/openai/whisper/blob/main/LICENSE
- OpenWhispr application README states MIT and documents local
  Whisper/whisper.cpp usage —
  https://github.com/OpenWhispr/openwhispr/blob/main/README.md
- OpenSuperWhisper remains a reference only; no code or assets were copied.
  Its terms must be independently reviewed before using artifacts.
