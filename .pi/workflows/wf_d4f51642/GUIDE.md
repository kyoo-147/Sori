# Workflow Guide

Workflow: wf_d4f51642 — Real CPAL audio session boundary
Updated: 2026-08-11T10:57:10.820Z

This runtime-owned Guide preserves the Workflow plan and lessons for successor implementation agents. Read it for orientation, then verify current files and tests. Do not store raw reports, transcripts, credentials, or provider payloads here.

## Goal

Implement the v1 launch-brief in D:/work/Sori: connect real CPAL default-microphone capture and a truthful deterministic energy-VAD/session boundary to Sori's daemon hot path, owning crates/sori-audio and audio/VAD-related core contracts plus only narrowly necessary daemon integration while avoiding hotkey/Whisper/injection worker files. Deliver bounded mono PCM chunks, speech start/stop detection, lifecycle events, truthful no-device/permission/stream/cancellation/end-of-speech errors, hardware-independent fake tests, and a Windows manual microphone permission/device procedure. Do not claim full transcript/injection E2E and do not edit E2E scripts. Verify with cargo fmt/check/clippy/tests and commit/push direct PR only if repository credentials and project workflow permit; otherwise report the exact blocker and evidence.

### Done when

- real-cpal-capture: The daemon-side runtime dictation session starts and stops the CPAL default input device and emits bounded mono PCM chunks through a callable audio/session boundary.
  Evidence required: Relevant source files and cargo check/test evidence showing CPAL capture path and session API.
- truthful-vad-lifecycle: A deterministic real energy VAD detects speech start and stop/end-of-speech and publishes lifecycle events without unconditional fake transcript or success behavior.
  Evidence required: Audio/VAD implementation, lifecycle contract, and transition tests.
- truthful-errors: No-device, permission, stream, cancellation, and end-of-speech conditions are represented and surfaced truthfully.
  Evidence required: Error types/diagnostics and focused tests or compile-checked handling paths.
- hardware-independent-tests: Hardware-independent fake-source tests cover bounded chunking, VAD transitions, lifecycle behavior, and relevant errors.
  Evidence required: Test files and cargo test output.
- windows-manual-procedure: A Windows manual test procedure documents actual microphone permission and device behavior.
  Evidence required: Checked-in documentation with reproducible steps and expected outcomes.
- verification-and-delivery: Formatting, check, clippy, and tests pass; delivery status is reported accurately without overstating E2E coverage.
  Evidence required: Command output and git status/log/push evidence or exact delivery blocker.

### Boundaries

- scope-files: Changes stay within crates/sori-audio, audio/VAD-related core contracts, narrowly necessary daemon integration, and manual-test documentation.
  Evidence required: Git diff path audit.
- avoid-workers: Hotkey, Whisper, injection worker files, and E2E scripts are not edited.
  Evidence required: Git diff path audit.
- no-fake-success: No unconditional fake transcript or success is introduced or retained as the claimed audio/session result.
  Evidence required: Review of session/audio path and tests.

## Plan

1. [completed] implement-audio-boundary — Implement CPAL capture and VAD boundary
   Kind: work; advances: real-cpal-capture, truthful-vad-lifecycle, truthful-errors, hardware-independent-tests, windows-manual-procedure, scope-files, avoid-workers, no-fake-success; next review-audio-boundary
2. [completed] review-audio-boundary — Review implementation and evidence
   Kind: review; advances: real-cpal-capture, truthful-vad-lifecycle, truthful-errors, hardware-independent-tests, windows-manual-procedure, scope-files, avoid-workers, no-fake-success; pass verify-delivery; fail implement-audio-boundary
3. [future] verify-delivery — Run verification and inspect delivery
   Kind: work; advances: verification-and-delivery, scope-files, avoid-workers, no-fake-success; next final-review
4. [future] final-review — Independent final acceptance review
   Kind: final-review; advances: real-cpal-capture, truthful-vad-lifecycle, truthful-errors, hardware-independent-tests, windows-manual-procedure, verification-and-delivery, scope-files, avoid-workers, no-fake-success; pass finish; fail stop for parent decision

## What we did

- implement-audio-boundary attempt 1: completed
- review-audio-boundary attempt 1: completed; review fail

## Attempts and lessons

### 1. implement-audio-boundary attempt 1

- Recorded: 2026-08-11T10:55:39.651Z
- Route: next to review-audio-boundary
- Attempt status: completed

The implementation attempt did not produce a reliable accepted change: the agent reports concurrent worktree rewrites removed audio/session edits, workspace has unrelated modifications including E2E scripts, and only sori-audio/sori-core tests passed while sorid check is blocked by unrelated existing hotkey errors. Independently inspect the current tree and route based on actual evidence; do not assume audio work exists or clean unrelated changes.

## Current state

- Workflow status: reviewing
- Current or next Step: implement-audio-boundary

- real-cpal-capture: open
- truthful-vad-lifecycle: open
- truthful-errors: open
- hardware-independent-tests: open
- windows-manual-procedure: open
- verification-and-delivery: open
- scope-files: violated
- avoid-workers: violated
- no-fake-success: violated

## Next

implement-audio-boundary — Implement CPAL capture and VAD boundary

Kind: work
Requirements: real-cpal-capture, truthful-vad-lifecycle, truthful-errors, hardware-independent-tests, windows-manual-procedure, scope-files, avoid-workers, no-fake-success
Route: next review-audio-boundary
