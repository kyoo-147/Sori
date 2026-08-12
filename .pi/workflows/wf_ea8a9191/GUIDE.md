# Workflow Guide

Workflow: wf_ea8a9191 — Whisper provider lifecycle
Updated: 2026-08-11T10:54:17.985Z

This runtime-owned Guide preserves the Workflow plan and lessons for successor implementation agents. Read it for orientation, then verify current files and tests. Do not store raw reports, transcripts, credentials, or provider payloads here.

## Goal

Implement the v1 Whisper provider lifecycle in D:/work/Sori, limited to crates/sori-provider-whisper and narrowly related provider/pipeline contracts: real PCM/WAV encoding from AudioChunk samples, external whisper.cpp invocation through the existing process-runner boundary, binary/model discovery diagnostics, output parsing, timeout/cancellation, temporary-file cleanup, daemon/provider wiring boundary, deterministic fake-runner tests, and Windows installation/model lifecycle documentation. Preserve fake runner tests, never vendor binaries/models, and never edit hotkey/audio/injection implementations or UI/E2E scripts. Verify with cargo fmt/check/clippy/tests, then commit and push the direct PR if repository credentials/remotes permit; otherwise report the exact blocker and evidence.

### Done when

- real-whisper-lifecycle: A configured real whisper.cpp binary and model can be invoked through the provider boundary using WAV input and yields a parsed transcript only after successful process execution.
  Evidence required: Scoped provider implementation plus deterministic command/output tests and a successful cargo test/check result.
- explicit-prerequisite-failures: Missing or unusable binary/model, process failure, timeout, cancellation, malformed output, and cleanup failures are surfaced explicitly without fabricated successful transcripts.
  Evidence required: Provider error paths and deterministic fake-runner tests covering prerequisite and process failures.
- wiring-boundary: Daemon/provider wiring exposes the real Whisper provider through the existing provider/pipeline contract without changing prohibited subsystems.
  Evidence required: Scoped wiring diff and compile/test evidence.
- documentation: Windows installation, model lifecycle, and manual smoke prerequisites are documented without vendoring binaries or models.
  Evidence required: Repository documentation update in the allowed scope.
- verification-and-delivery: Formatting, check, clippy, and tests pass; changes are committed and pushed when possible.
  Evidence required: Command outputs plus git commit/push evidence, or exact credential/remote blocker.

### Boundaries

- scope-only: Only crates/sori-provider-whisper and narrowly related provider/pipeline contracts and documentation are changed.
  Evidence required: git diff --stat and changed-path inspection.
- no-prohibited-edits: Hotkey, audio, injection implementations, and UI/E2E scripts remain untouched.
  Evidence required: git diff --name-only checked against prohibited paths.
- no-vendored-assets: No whisper binaries or model files are added to the repository.
  Evidence required: git status and file inventory.

## Plan

1. [preparing] implement — Implement lifecycle
   Kind: work; advances: real-whisper-lifecycle, explicit-prerequisite-failures, wiring-boundary, documentation; next review-implementation
2. [completed] review-implementation — Review implementation
   Kind: review; advances: real-whisper-lifecycle, explicit-prerequisite-failures, wiring-boundary, documentation; pass verify-delivery; fail implement
3. [future] verify-delivery — Verify and deliver
   Kind: work; advances: verification-and-delivery, scope-only, no-prohibited-edits, no-vendored-assets; next final-review
4. [future] final-review — Final acceptance review
   Kind: final-review; advances: real-whisper-lifecycle, explicit-prerequisite-failures, wiring-boundary, documentation, verification-and-delivery, scope-only, no-prohibited-edits, no-vendored-assets; pass finish; fail stop for parent decision

## What we did

- implement attempt 1: completed
- implement attempt 2: completed
- implement attempt 3: completed
- implement attempt 4: completed
- implement attempt 5: preparing
- review-implementation attempt 1: completed; review fail
- review-implementation attempt 2: completed; review fail
- review-implementation attempt 3: completed; review fail
- review-implementation attempt 4: completed; review fail

## Attempts and lessons

### 1. implement attempt 1

- Recorded: 2026-08-11T10:25:48.894Z
- Route: next to review-implementation
- Attempt status: completed

Implementation report claims scoped lifecycle changes in crates/sori-provider-whisper/src/lib.rs and docs/backend/whisper-provider.md, with focused formatting and diff checks; cargo test/check are reportedly blocked by unrelated pre-existing Windows errors. Independently inspect the changed code, tests, wiring, diagnostics, cleanup, and scope. Pass only if requirements are substantively implemented; otherwise route back with precise missing evidence/fixes.

### 2. review-implementation attempt 1

- Recorded: 2026-08-11T10:27:26.500Z
- Route: fail to implement
- Attempt status: completed

Review found the provider internals largely pass, but the central contract is still stubbed and no daemon wiring exists; it also found unrelated prohibited edits. Recovery must first inspect the actual current diff, revert every prohibited/unrelated change without losing legitimate baseline work, then integrate Whisper through the existing ModelProvider/pipeline contract and daemon dependency only within allowed contracts. Do not repeat leaving transcribe as a permanent error or claiming wiring from provider-only APIs. Preserve explicit failures, tests, docs, and prove the resulting scoped compile path.

### 3. implement attempt 2

- Recorded: 2026-08-11T10:36:28.416Z
- Route: next to review-implementation
- Attempt status: completed

The second implementation attempt reports that the provider contract and daemon wiring were added, prohibited paths were removed, and the focused provider tests pass, but it also reports an untouched hotkey baseline compile blocker. Independently verify the actual diff and implementation now; pass only if the real provider is reachable through the existing contract, wiring is scoped, and no prohibited changes remain. Check that claimed revert did not discard needed baseline changes.

### 4. review-implementation attempt 2

- Recorded: 2026-08-11T10:37:40.401Z
- Route: fail to implement
- Attempt status: completed

Second review still fails the central acceptance: main.rs only constructs/logs the provider, sorid lacks the provider dependency, and prohibited edits remain in the snapshot. The next attempt must inspect git status/diff rather than trust reports, restore all prohibited paths, add only minimal compiling provider/pipeline/daemon wiring that actually invokes the provider, and update docs to match the functional path. Do not claim success while the import/dependency or call path is absent; preserve the already-good provider error/cleanup behavior.

### 5. implement attempt 3

- Recorded: 2026-08-11T10:42:27.330Z
- Route: next to review-implementation
- Attempt status: completed

The latest implementer claims the missing dependency and actual DaemonRuntime provider call path are now added, and prohibited changes reverted. Independently inspect the current snapshot and verify these claims, including whether main/runtime wiring is truly reachable and whether changed paths are scoped. If all implementation requirements pass, route to delivery verification; otherwise route back with exact defects.

### 6. review-implementation attempt 3

- Recorded: 2026-08-11T10:44:20.371Z
- Route: fail to implement
- Attempt status: completed

Review still finds no reachable daemon dictation path, prohibited paths in the current diff/status, and a missing Windows module blocking compilation. The next implementation attempt must verify the filesystem and diff directly, restore prohibited files to the repository baseline (do not merely claim they were reverted), and make the minimal allowed sorid/runtime/pipeline wiring actually invoke capture-to-AudioChunk-to-ModelProvider flow. Do not edit prohibited implementations or invent a successful validation result; if the missing module is baseline, document it as a blocker while still making focused provider tests runnable if possible. Keep docs aligned with the actual reachable path and format modified files.

### 7. implement attempt 4

- Recorded: 2026-08-11T10:52:50.633Z
- Route: next to review-implementation
- Attempt status: completed

The latest work claims a reachable IPC Dictation request/handler was added and prohibited tracked residue removed, but validation reports a transient duplicate-dependency/check issue and untracked .pi metadata. Independently inspect current files and diff, verify the IPC path truly forwards AudioChunk to ModelProvider, confirm scope/no prohibited edits, and run focused tests/checks. Pass only on concrete evidence; otherwise route back with exact remaining defects.

### 8. review-implementation attempt 4

- Recorded: 2026-08-11T10:54:17.985Z
- Route: fail to implement
- Attempt status: completed

The review confirms provider behavior and IPC forwarding pass, but wiring/scope fail because prohibited audio/core/injection/UI/E2E changes still exist, modified audio breaks sorid validation, and the daemon path bypasses run_dictation. Treat the current working tree as authoritative: inspect and restore every prohibited path to HEAD (including any untracked task residue that is not Workflow metadata), then keep only Whisper, sorid/provider-contract wiring, Cargo.lock, and docs. Make sorid compile against the restored baseline; do not repair unrelated audio/hotkey issues. Preserve the reachable IPC Dictation boundary if it is the minimal allowed contract, and only integrate run_dictation if it can be done without prohibited implementation edits. Format all modified allowed files and run focused tests/checks.

## Current state

- Workflow status: preparing
- Current or next Step: implement

- real-whisper-lifecycle: satisfied
- explicit-prerequisite-failures: satisfied
- wiring-boundary: open
- documentation: satisfied
- verification-and-delivery: open
- scope-only: open
- no-prohibited-edits: open
- no-vendored-assets: open

## Next

implement — Implement lifecycle

Kind: work
Requirements: real-whisper-lifecycle, explicit-prerequisite-failures, wiring-boundary, documentation
Route: next review-implementation
