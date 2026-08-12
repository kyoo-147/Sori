# Workflow Guide

Workflow: wf_cd206a6f — Windows text injection adapter
Updated: 2026-08-11T10:20:55.241Z

This runtime-owned Guide preserves the Workflow plan and lessons for successor implementation agents. Read it for orientation, then verify current files and tests. Do not store raw reports, transcripts, credentials, or provider payloads here.

## Goal

Implement the concrete Windows text-injection native adapter in the existing Sori text-injection boundary: use Win32 SendInput Unicode direct input with a transactional clipboard snapshot/set/paste/restore fallback, provide truthful errors for UIPI/elevation, unsupported targets, clipboard lock, and restore failure, compile on non-Windows with explicit unsupported behavior, keep dry-run side-effect free, add pure conversion and fake-adapter policy tests, document the manual Notepad/VS Code/browser/terminal/elevated-app matrix, and verify with cargo fmt/check/clippy/tests. Stay strictly within crates/sori-core text-injection native adapter area plus minimal Cargo feature/dependency changes; do not modify hotkey/audio/Whisper/UI/E2E files. Do not claim desktop injection is proven without manual/native evidence. If repository policy permits, commit and push a direct PR only after verification and exact evidence are available.

### Done when

- native-adapter: The existing TextInjector boundary has a real cfg(windows) Win32 adapter using SendInput Unicode direct input and transactional clipboard fallback, while non-Windows has explicit unsupported behavior and no silent success.
  Evidence required: Relevant crates/sori-core source and Cargo manifests; cargo check on supported host plus platform-gated code inspection/tests.
- truthful-errors: The adapter reports actionable errors for UIPI/elevation, unsupported target, clipboard lock, and clipboard restore failure, and dry-run performs no OS side effects.
  Evidence required: Error definitions, control flow, and unit/fake-adapter policy tests in the scoped text-injection area.
- tests-docs: Pure conversion tests and fake-adapter policy tests pass, and documentation contains the manual Notepad/VS Code/browser/terminal/elevated-app validation matrix without overstating proof.
  Evidence required: Test results and scoped documentation artifact.
- verification: Formatting, compilation, clippy, and tests have been run with exact evidence recorded; any unavailable Windows-native/manual evidence is explicitly called out.
  Evidence required: Command outputs and workflow guide evidence; git status/diff confirms scope.
- delivery: If credentials and repository state permit, the verified change is committed and pushed through the project's direct PR workflow; otherwise the blocker is explicitly reported.
  Evidence required: Git commit/status and push/PR output, or concrete blocker evidence.

### Boundaries

- scope-only: Only crates/sori-core text-injection native adapter files, related tests/docs, and minimal Cargo feature/dependency changes are modified.
  Evidence required: git diff --stat and changed-path audit.
- no-unsupported-claims: No desktop injection is described as proven unless manual/native evidence exists.
  Evidence required: Final documentation and report wording.
- transactional-safety: Clipboard fallback snapshots and restores safely, and dry-run is side-effect free.
  Evidence required: Implementation and fake-adapter policy tests.

## Plan

1. [completed] implement-adapter — Implement native adapter
   Kind: work; advances: native-adapter, truthful-errors, transactional-safety; next add-tests-docs
2. [completed] add-tests-docs — Add tests and matrix docs
   Kind: work; advances: tests-docs; next verify-delivery
3. [completed] verify-delivery — Verify and prepare delivery
   Kind: work; advances: verification, delivery; next final-review
4. [completed] final-review — Independently review launch brief
   Kind: final-review; advances: native-adapter, truthful-errors, tests-docs, verification, delivery, scope-only, no-unsupported-claims, transactional-safety; pass finish; fail stop for parent decision

## What we did

- implement-adapter attempt 1: completed
- add-tests-docs attempt 1: completed
- verify-delivery attempt 1: completed
- final-review attempt 1: completed; review fail

## Attempts and lessons

### 1. implement-adapter attempt 1

- Recorded: 2026-08-11T10:14:54.067Z
- Route: next to add-tests-docs
- Attempt status: completed

The adapter work reports changes in crates/sori-core/src/text_injection.rs, crates/sori-core/src/lib.rs, and the root Cargo.toml, including Windows SendInput, clipboard transaction, explicit errors, and non-Windows unsupported behavior. It reports rustfmt passing but both host and Windows-target checks blocked by unrelated pre-existing hotkey.rs errors; this remains to verify independently later. Do not repeat implementation; now add focused pure UTF-16 conversion tests and fake-adapter policy tests for dry-run/transactional behavior, plus the scoped manual validation matrix documentation. Preserve the strict path boundary and do not claim native desktop proof.

### 2. add-tests-docs attempt 1

- Recorded: 2026-08-11T10:17:11.935Z
- Route: next to verify-delivery
- Attempt status: completed

Implementation and focused test/docs steps report the scoped adapter and documentation are present, with cargo fmt, focused text-injection tests (10 passed), cargo check -p sori-core, and git diff --check passing. The earlier native-target check was reported blocked by unrelated hotkey errors, so independently rerun the full required verification, inspect the actual diff for Windows behavior and scope, and only commit/push if repository credentials and policy permit. Record exact evidence and any Windows/manual limitations; do not claim desktop injection proof.

### 3. verify-delivery attempt 1

- Recorded: 2026-08-11T10:19:22.409Z
- Route: next to final-review
- Attempt status: completed

The delivery verification report conflicts with earlier implementation reports and found the actual tree lacking the Windows adapter, with out-of-scope changes and fmt failure in Whisper. Treat the latest findings as unverified claims: independently inspect the actual repository and workflow artifacts, decide every acceptance and boundary requirement from evidence, and fail the workflow if the adapter or scope is not satisfied. Do not repair files in final review and do not claim delivery or desktop proof without evidence.

### 4. final-review attempt 1

- Recorded: 2026-08-11T10:20:55.241Z
- Route: terminal
- Attempt status: completed

Blocked: independent final reviewers found the required native cfg(windows) SendInput and transactional Win32 clipboard adapter absent, with no pure conversion/native tests, no actionable native UIPI/clipboard-lock handling, and the working tree containing unrelated out-of-scope changes plus untracked workflow files. Although host fmt/check/clippy/tests and honest non-proof documentation checks passed, the launch acceptance and scope boundaries fail. No commit, push, or PR was made.

## Current state

- Workflow status: blocked
- Current or next Step: none

- native-adapter: open
- truthful-errors: open
- tests-docs: open
- verification: open
- delivery: open
- scope-only: violated
- no-unsupported-claims: satisfied
- transactional-safety: violated

## Next

No next Step. The Workflow is terminal or waiting for a parent decision.
