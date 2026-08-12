# Workflow Guide

Workflow: wf_11311856 — Real CPAL audio and VAD boundary
Updated: 2026-08-11T10:57:02.480Z

This runtime-owned Guide preserves the Workflow plan and lessons for successor implementation agents. Read it for orientation, then verify current files and tests. Do not store raw reports, transcripts, credentials, or provider payloads here.

## Goal

Implement the v1 launch brief in the current Sori repository: connect real CPAL default microphone capture and a truthful deterministic energy-VAD/session boundary to the daemon hot path, scoped to crates/sori-audio, audio/VAD core contracts, and narrowly necessary daemon integration while avoiding hotkey/Whisper/injection worker files. Preserve hardware-independent fake-based tests and add a Windows manual microphone permission/device procedure. Verify with cargo fmt/check/clippy/tests, inspect the resulting diff, and commit the scoped implementation; do not claim transcript/injection E2E unless actually connected and do not edit E2E scripts.

### Done when

- real-cpal-capture: Runtime dictation sessions start and stop the CPAL default input device and deliver bounded mono PCM chunks through the daemon audio/session boundary.
  Evidence required: Scoped source diff plus compile/test evidence showing CPAL stream construction, lifecycle, bounded chunk delivery, and daemon callability.
- truthful-vad-lifecycle: A deterministic energy VAD produces speech start/stop transitions and publishes truthful lifecycle events without unconditional fake transcript/success behavior.
  Evidence required: Audio/VAD implementation and hardware-independent transition tests covering silence, speech, end-of-speech, and cancellation/error paths.
- truthful-errors: No-device, permission, stream, cancellation, and end-of-speech failures are represented and surfaced with clear diagnostics.
  Evidence required: Error contracts, propagation sites, and tests asserting each applicable failure classification/message.
- manual-windows-procedure: A Windows manual test procedure documents microphone permission and default-device behavior for the real path.
  Evidence required: Committed documentation in the repository with concrete setup, execution, and expected failure/success observations.
- verification-and-commit: The scoped implementation passes formatting, check, clippy, and tests, and is committed without modifying E2E scripts or unrelated worker ownership files.
  Evidence required: Command outputs, git diff/status, and commit identity.

### Boundaries

- scope-boundary: Changes stay within crates/sori-audio, audio/VAD-related core contracts, narrowly necessary daemon integration, and the manual test documentation.
  Evidence required: Final git diff path review.
- no-e2e-claims: No E2E scripts are edited and transcript/injection end-to-end is not represented as complete unless concretely connected.
  Evidence required: Final diff path review and final report wording.

## Plan

1. [completed] implement-audio-boundary — Implement CPAL capture and VAD session boundary
   Kind: work; advances: real-cpal-capture, truthful-vad-lifecycle, truthful-errors, manual-windows-procedure, scope-boundary, no-e2e-claims; next review-audio-boundary
2. [completed] review-audio-boundary — Review implementation and verification
   Kind: review; advances: real-cpal-capture, truthful-vad-lifecycle, truthful-errors, manual-windows-procedure, scope-boundary; pass final-review; fail implement-audio-boundary
3. [future] final-review — Independent final acceptance review
   Kind: final-review; advances: real-cpal-capture, truthful-vad-lifecycle, truthful-errors, manual-windows-procedure, verification-and-commit, scope-boundary, no-e2e-claims; pass finish; fail stop for parent decision

## What we did

- implement-audio-boundary attempt 1: completed
- implement-audio-boundary attempt 2: completed
- implement-audio-boundary attempt 3: completed
- review-audio-boundary attempt 1: completed; review fail
- review-audio-boundary attempt 2: completed; review fail
- review-audio-boundary attempt 3: completed; review fail

## Attempts and lessons

### 1. implement-audio-boundary attempt 1

- Recorded: 2026-08-11T10:31:21.815Z
- Route: next to review-audio-boundary
- Attempt status: completed

The implementer added the claimed CPAL/audio lifecycle, VAD/error contracts, tests, and Windows procedure and reports scoped checks passing, but did not commit due to repository policy; independently inspect the actual diff and current tree, verify behavior and scope, and route pass only if evidence supports the requirements. Treat unrelated pre-existing E2E modifications as baseline and do not expand scope.

### 2. review-audio-boundary attempt 1

- Recorded: 2026-08-11T10:32:38.006Z
- Route: fail to implement-audio-boundary
- Attempt status: completed

Review failed: the CPAL adapter is not instantiated by sorid, the production path still uses only EnergyVadStub with no capture/VAD lifecycle publication, error mappings/tests are incomplete, the Windows document is untracked, and the reviewer found unrelated pre-existing E2E/provider/runtime changes. Do not repeat the partial adapter-only approach. Add the narrowly necessary daemon/audio integration and real session VAD/error propagation, preserve and explicitly isolate unrelated baseline changes, add focused fake tests and ensure the manual procedure is included. User explicitly requires a commit, so commit only the scoped files if possible; do not edit E2E scripts or worker files. Re-run relevant verification and report exact limitations.

### 3. implement-audio-boundary attempt 2

- Recorded: 2026-08-11T10:42:04.171Z
- Route: next to review-audio-boundary
- Attempt status: completed

Retry implementation reported it could not complete because scoped edits were repeatedly reverted by concurrent worktree changes; no reliable new evidence exists and no commit was created. Re-inspect the actual current tree before routing: if the required daemon integration is still absent, route back for another implementation attempt with a minimal concrete scope; do not pass on the earlier adapter-only claims.

### 4. review-audio-boundary attempt 2

- Recorded: 2026-08-11T10:43:45.457Z
- Route: fail to implement-audio-boundary
- Attempt status: completed

Recheck confirms no scoped implementation exists: CPAL and EnergyVadStub are baseline, sorid has no sori-audio dependency or capture/VAD wiring, error variants/tests and manual procedure are absent, and the tree has unrelated baseline changes plus a missing-module compile failure. Implement the complete boundary now in a minimal set of audio/core/daemon/docs files; do not touch or reset unrelated changes. If the current tree cannot support safe integration because required daemon/core files are missing, document the blocker and stop rather than claiming success.

### 5. implement-audio-boundary attempt 3

- Recorded: 2026-08-11T10:55:44.182Z
- Route: next to review-audio-boundary
- Attempt status: completed

The latest implementer reports new changes in sori-audio/core/sorid/docs, but the report is unverified, omits the required explicit commit, and admits daemon checks remain blocked. Inspect the actual current tree and diff to determine whether the required integration and truthful errors are now present; route pass only on concrete evidence, otherwise fail back with precise remaining defects.

## Current state

- Workflow status: reviewing
- Current or next Step: implement-audio-boundary

- real-cpal-capture: open
- truthful-vad-lifecycle: open
- truthful-errors: open
- manual-windows-procedure: open
- verification-and-commit: open
- scope-boundary: violated
- no-e2e-claims: open

## Next

implement-audio-boundary — Implement CPAL capture and VAD session boundary

Kind: work
Requirements: real-cpal-capture, truthful-vad-lifecycle, truthful-errors, manual-windows-procedure, scope-boundary, no-e2e-claims
Route: next review-audio-boundary
