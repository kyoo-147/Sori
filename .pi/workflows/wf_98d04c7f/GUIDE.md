# Workflow Guide

Workflow: wf_98d04c7f — Windows global hotkey boundary
Updated: 2026-08-11T10:48:35.149Z

This runtime-owned Guide preserves the Workflow plan and lessons for successor implementation agents. Read it for orientation, then verify current files and tests. Do not store raw reports, transcripts, credentials, or provider payloads here.

## Goal

Implement Sori's real Windows global Alt+Space hold-to-talk hotkey boundary, limited to hotkey contracts/native adapter and sorid daemon lifecycle integration. Preserve non-Windows compilation with explicit unsupported results; use real RegisterHotKey/message handling or a justified low-level hook for release semantics; truthfully surface startup conflicts/errors; unregister on shutdown; add Windows-gated/manual and platform-neutral deterministic tests and documentation. Do not edit audio, Whisper, injection, UI, or E2E scripts owned by other workers. Run cargo fmt, check, clippy, and relevant cargo tests. Commit the implementation and push a direct PR, then report exact evidence and native behavior not exercised.

### Done when

- hotkey-contracts: Hotkey contracts normalize press/release/cancel and expose explicit unsupported/error outcomes across platforms.
  Evidence required: Relevant Rust hotkey contract files plus deterministic platform-neutral tests pass.
- windows-adapter: A concrete Windows global hotkey registration and message-loop adapter handles configured Alt+Space and produces normalized events without faking success.
  Evidence required: Windows-gated adapter code and Windows-gated/manual test/documentation identify the real API and verification limits.
- daemon-lifecycle: sorid registers at startup, truthfully reports conflicts/errors, receives events, and unregisters during shutdown.
  Evidence required: Daemon integration code and lifecycle tests or deterministic seams demonstrate registration/unregistration and error propagation.
- cross-platform: Non-Windows builds retain an explicit unsupported result and relevant formatting/check/clippy/tests succeed.
  Evidence required: cargo fmt, cargo check, cargo clippy, and relevant cargo test output.
- delivery: Changes are committed and pushed via the repository's direct PR workflow.
  Evidence required: Git commit and push/PR command results with commit/branch references.

### Boundaries

- scope-only: Only hotkey contracts/native adapter, daemon registration/event/unregistration integration, tests, and docs are changed.
  Evidence required: git diff --stat and changed-path review show no audio, Whisper, injection, UI, or E2E script changes.
- no-fake-success: Unsupported platforms and native registration failures are explicit and never reported as successful registration.
  Evidence required: Error/result paths and tests cover unsupported/conflict failures.
- no-interactive-ci: Automated tests do not require an interactive desktop.
  Evidence required: Test declarations and commands show deterministic tests; manual Windows behavior is separately labeled.

## Plan

1. [completed] inspect-design — Inspect hotkey architecture
   Kind: work; advances: hotkey-contracts, windows-adapter, daemon-lifecycle, scope-only; next implement-boundary
2. [failed] implement-boundary — Implement boundary and lifecycle
   Kind: work; advances: hotkey-contracts, windows-adapter, daemon-lifecycle, cross-platform; next review-boundary
3. [completed] review-boundary — Review and verify implementation
   Kind: review; advances: hotkey-contracts, windows-adapter, daemon-lifecycle, cross-platform, no-fake-success, no-interactive-ci, scope-only; pass final-review; fail implement-boundary
4. [future] final-review — Final independent acceptance review
   Kind: final-review; advances: hotkey-contracts, windows-adapter, daemon-lifecycle, cross-platform, delivery, scope-only, no-fake-success, no-interactive-ci; pass finish; fail stop for parent decision

## What we did

- inspect-design attempt 1: completed
- implement-boundary attempt 1: completed
- implement-boundary attempt 2: completed
- implement-boundary attempt 3: completed
- implement-boundary attempt 4: failed; failure subagent_progress_incomplete
- review-boundary attempt 1: completed; review fail
- review-boundary attempt 2: completed; review fail
- review-boundary attempt 3: completed; review fail

## Attempts and lessons

### 1. inspect-design attempt 1

- Recorded: 2026-08-11T10:11:06.994Z
- Route: next to implement-boundary
- Attempt status: completed

Inspection found a scaffolded core hotkey contract and Windows RegisterHotKey registration, but no real release-capable native boundary or sorid lifecycle wiring. Implement the missing adapter and daemon integration in scoped files only; preserve existing scripts/.pi changes, use explicit non-Windows Unsupported, and verify with deterministic tests plus clearly labeled Windows/manual coverage.

### 2. implement-boundary attempt 1

- Recorded: 2026-08-11T10:19:35.393Z
- Route: next to review-boundary
- Attempt status: completed

Implementation report claims scoped changes, real RegisterHotKey plus WH_KEYBOARD_LL release/cancel handling, daemon lifecycle wiring, and passing check/clippy/tests. Review independently, inspect the actual diff and APIs, verify tests and scope, and route based on evidence; pay special attention to message-pump correctness, hook lifetime/threading, configured binding validation, truthful failures, and whether startup/shutdown behavior is genuinely wired.

### 3. review-boundary attempt 1

- Recorded: 2026-08-11T10:21:26.415Z
- Route: fail to implement-boundary
- Attempt status: completed

Review failed only windows-adapter and daemon-lifecycle. Fix the concrete issues without broadening scope: filter WM_HOTKEY by the adapter's registration id and avoid consuming unrelated host messages; remove or redesign unsafe thread-affinity Send behavior for the hook/message-loop resource; and guarantee unregister cleanup on every sorid main-loop exit, including server completion and poll errors. Preserve existing passing contract, cross-platform, no-fake-success, and deterministic-test evidence. Re-run full relevant verification and inspect scope.

### 4. implement-boundary attempt 2

- Recorded: 2026-08-11T10:27:49.345Z
- Route: next to review-boundary
- Attempt status: completed

The retry reports targeted fixes for message filtering, queue ownership, thread-affinity ownership, and all main-loop cleanup exits. Independently verify those exact changes in the current tree, rerun scoped formatting/check/clippy/tests plus Windows-target check where available, and route only from observed evidence.

### 5. review-boundary attempt 2

- Recorded: 2026-08-11T10:29:36.018Z
- Route: fail to implement-boundary
- Attempt status: completed

The second review found the current tree still lacks the claimed release-capable adapter and sorid lifecycle wiring, and also reports unrelated worker changes in the working tree. Treat those reports as evidence to verify, not assumptions: inspect the actual current files and implement the missing scoped functionality now. Do not touch or revert unrelated files; ensure the final scoped diff can be isolated for delivery. Required acceptance remains real release/cancel production events, configured Alt+Space parsing, safe message ownership/threading, startup-before-ready/error propagation, and unregister on every exit, with deterministic/manual verification.

### 6. implement-boundary attempt 3

- Recorded: 2026-08-11T10:41:44.020Z
- Route: next to review-boundary
- Attempt status: completed

Latest implementation claims parser and polling additions but explicitly admits daemon lifecycle integration and low-level release adapter are still missing; prior review also found scope contamination from unrelated worker files. Independently inspect the actual latest tree and verify whether the current implementation satisfies the immutable requirements. If lifecycle or real release-capable native behavior remains absent, fail with exact evidence so the runtime routes back to implementation; do not infer success from reports.

### 7. review-boundary attempt 3

- Recorded: 2026-08-11T10:43:29.003Z
- Route: fail to implement-boundary
- Attempt status: completed

The latest review confirms the required adapter and daemon lifecycle are still absent in the current tree, and compilation is currently blocked by unrelated worker changes including a missing windows_text_injection module. Implement the missing scoped functionality in the actual current files, without touching or reverting prohibited worker paths. Keep the non-Windows contract compiling independently where possible and report any verification blocked solely by unrelated changes; do not claim completion until the scoped implementation is real and reviewed.

## Current state

- Workflow status: reviewing
- Current or next Step: implement-boundary

- hotkey-contracts: satisfied
- windows-adapter: open
- daemon-lifecycle: open
- cross-platform: invalidated
- delivery: open
- scope-only: violated
- no-fake-success: satisfied
- no-interactive-ci: satisfied

## Next

implement-boundary — Implement boundary and lifecycle

Kind: work
Requirements: hotkey-contracts, windows-adapter, daemon-lifecycle, cross-platform
Route: next review-boundary
