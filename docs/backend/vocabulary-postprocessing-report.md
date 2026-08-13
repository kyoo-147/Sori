# Worker E standalone delivery report

## Scope

Vocabulary/post-processing was traced from the desktop vocabulary resource through loopback IPC and SQLite persistence into the canonical dictation pipeline.

## Delivered

- `crates/sori-core/src/vocabulary.rs`
  - vocabulary terms, pronunciation hints, explicit corrections
  - deterministic prompt rendering
  - boundary-safe, case-insensitive normalization
- `crates/sori-core/src/model.rs`
  - backward-compatible `transcribe_with_context` provider hook
- `crates/sori-core/src/pipeline.rs`
  - ASR context and normalization applied before injection/history
- `crates/sorid/src/main.rs`
  - persisted `resource.vocabulary` loaded before captured dictation
- `crates/sori-provider-whisper/src/lib.rs`
  - vocabulary prompt passed to whisper.cpp through argument-based `--prompt`
- `apps/desktop/src/types.ts`
  - correction field represented in the vocabulary model
- `docs/backend/vocabulary-postprocessing.md`
  - implementation boundary, upstream reference, and MIT license note

The desktop already uses canonical `ResourceGet`/`ResourceSet` IPC for vocabulary. SQLite settings therefore survive daemon restart; the daemon consumes the persisted value rather than treating the UI state as authoritative.

## Evidence

- `cargo fmt --all`: PASS
- `CARGO_BUILD_JOBS=1 cargo check -q`: PASS
- `cargo test -q -p sori-core --lib`: PASS — 27 tests
- `cargo test -q -p sori-provider-whisper --lib`: PASS — 13 passed, 1 ignored
- `git diff --check`: PASS
- PR: https://github.com/kyoo-147/Sori/pull/107
- Commit: `7b057b1`

Root npm build remains blocked by existing TypeScript configuration errors in:

- `tests/desktop-viewport-userflow.test.ts` (`--jsx` not set)
- `tests/desktop-window-controls.test.ts` (`--jsx` not set and `globalThis` typing)

## Native/hardware boundary

Native microphone capture, physical hotkey input, configured whisper.cpp executable/model inference, and focused-application injection were **not exercised in this environment**. They remain `UNVERIFIED`; no physical transcript success is claimed. Provider fake/unit coverage verifies prompt construction and normalization only.

The PR is open and pushed. No merge was performed.
