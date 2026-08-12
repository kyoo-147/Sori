# Workflow Guide

Workflow: wf_f45a4e39 — Whisper provider v1 lifecycle
Updated: 2026-08-11T10:22:00.421Z

This runtime-owned Guide preserves the Workflow plan and lessons for successor implementation agents. Read it for orientation, then verify current files and tests. Do not store raw reports, transcripts, credentials, or provider payloads here.

## Goal

Implement the v1 Whisper provider lifecycle in D:/work/Sori: real PCM/WAV input encoding from AudioChunk samples; external whisper.cpp invocation through the existing process-runner boundary; binary/model discovery; output parsing; explicit missing prerequisite diagnostics; timeout/cancellation and temporary-file cleanup; daemon/provider wiring boundary; deterministic fake-runner tests; Windows installation/model lifecycle and manual smoke documentation. Preserve fake runner tests, never vendor binaries/models, do not edit hotkey/audio/injection implementations or UI/E2E scripts, and never report a successful transcript when the process was not run. Verify with cargo fmt, cargo check, cargo clippy, cargo test, then commit and push the direct PR with exact evidence.

### Done when

- provider-lifecycle: Configured binary and model can be invoked through the provider boundary with WAV input and parsed transcript output.
  Evidence required: Provider implementation and integration tests exercising the fake process-runner boundary.
- failure-diagnostics: Missing binary/model, process failure, timeout/cancellation, malformed output, and cleanup failures are explicit and cannot yield a false successful transcript.
  Evidence required: Error-path tests and inspected provider error handling.
- deterministic-tests: Deterministic tests cover WAV bytes, command construction, output parsing, and failure behavior without real binaries/models.
  Evidence required: Targeted cargo test results and test source paths.
- wiring-boundary: Daemon/provider wiring is updated only at the narrowly related provider/pipeline contract boundary.
  Evidence required: Diff inspection limited to allowed crates/contracts and wiring tests.
- documentation: Windows installation/model lifecycle and manual smoke prerequisites are documented.
  Evidence required: Documentation file path and content inspection.
- verification-delivery: Formatting, check, clippy, tests, commit, and push have exact recorded evidence.
  Evidence required: Command outputs plus git commit/push evidence.

### Boundaries

- scope-files: No hotkey/audio/injection implementations or UI/E2E scripts are edited.
  Evidence required: git diff --name-only and diff inspection.
- no-assets: No whisper binaries or model files are vendored.
  Evidence required: git diff/status and repository file inspection.
- runner-boundary: Process execution remains behind the existing process-runner abstraction and fake runner tests remain usable.
  Evidence required: Provider code and test doubles inspection.

## Plan

1. [completed] implement — Implement provider lifecycle
   Kind: work; advances: provider-lifecycle, failure-diagnostics, wiring-boundary; next test-docs
2. [completed] test-docs — Add deterministic tests and docs
   Kind: work; advances: deterministic-tests, documentation; next verify
3. [completed] verify — Run verification and delivery
   Kind: work; advances: verification-delivery, scope-files, no-assets, runner-boundary; next final-review
4. [completed] final-review — Independently review launch brief
   Kind: final-review; advances: provider-lifecycle, failure-diagnostics, deterministic-tests, wiring-boundary, documentation, verification-delivery, scope-files, no-assets, runner-boundary; pass finish; fail stop for parent decision

## What we did

- implement attempt 1: completed
- test-docs attempt 1: completed
- verify attempt 1: completed
- final-review attempt 1: completed; review fail

## Attempts and lessons

### 1. implement attempt 1

- Recorded: 2026-08-11T10:14:51.685Z
- Route: next to test-docs
- Attempt status: completed

Implementation changed only crates/sori-provider-whisper/src/lib.rs, adding WAV encoding, external runner lifecycle/options, transcript validation, and cleanup diagnostics. The implementer reports focused rustfmt passed, while workspace-wide formatting and provider tests were blocked by unrelated existing sori-core hotkey Send-bound errors. Continue by independently inspecting the implementation, adding deterministic fake-runner coverage for WAV bytes, command construction, parsing, and failures, and documenting Windows binary/model installation and manual smoke prerequisites without touching forbidden areas or committing yet.

### 2. test-docs attempt 1

- Recorded: 2026-08-11T10:18:58.617Z
- Route: next to verify
- Attempt status: completed

The implementation and tests/docs steps report changes limited to crates/sori-provider-whisper/src/lib.rs and docs/backend/whisper-provider.md. Reported focused rustfmt and 10 provider tests pass, with no forbidden files or assets changed. Verify the actual diff and repository state, then run the required workspace commands (fmt, check, clippy, tests), resolve only in-scope issues needed for the real process lifecycle, and commit/push the direct PR if all evidence supports it. Record exact command outcomes and scope/no-asset checks.

### 3. verify attempt 1

- Recorded: 2026-08-11T10:20:37.286Z
- Route: next to final-review
- Attempt status: completed

Verification report claims cargo fmt, workspace check, clippy with warnings denied, workspace tests, and diff check passed, but no commit/push occurred because unrelated pre-existing worktree changes were present. Final review must independently inspect the actual implementation, tests, docs, scope, assets, and git state; assess every acceptance criterion and whether the missing commit/push makes verification-delivery fail. Do not modify files.

### 4. final-review attempt 1

- Recorded: 2026-08-11T10:22:00.421Z
- Route: terminal
- Attempt status: completed

Blocked by final review: production daemon/pipeline wiring is absent, runtime timeout/cancellation is not implemented, documentation/manual smoke coverage is incomplete, and the worktree contains pre-existing forbidden hotkey/audio/UI/E2E changes that prevent a scoped commit/push. No commit or push was made. Passing evidence: no binaries/models were vendored, runner abstraction remained intact, and focused provider tests plus cargo fmt/check/clippy/test commands passed.

## Current state

- Workflow status: blocked
- Current or next Step: none

- provider-lifecycle: open
- failure-diagnostics: open
- deterministic-tests: open
- wiring-boundary: open
- documentation: open
- verification-delivery: open
- scope-files: violated
- no-assets: satisfied
- runner-boundary: satisfied

## Next

No next Step. The Workflow is terminal or waiting for a parent decision.
