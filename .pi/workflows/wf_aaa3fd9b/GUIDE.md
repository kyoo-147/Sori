# Workflow Guide

Workflow: wf_aaa3fd9b — Windows hotkey boundary
Updated: 2026-08-11T10:48:35.264Z

This runtime-owned Guide preserves the Workflow plan and lessons for successor implementation agents. Read it for orientation, then verify current files and tests. Do not store raw reports, transcripts, credentials, or provider payloads here.

## Goal

Implement Sori's real Windows global Alt+Space hold-to-talk hotkey boundary and sorid lifecycle integration, preserving explicit unsupported behavior on non-Windows, with truthful registration/conflict errors, unregister on shutdown, deterministic platform-neutral tests, Windows-gated/manual tests and documentation. Scope excludes audio, Whisper, injection, UI, and E2E scripts. Verify with cargo fmt, cargo check, cargo clippy, relevant cargo tests, then commit and push a direct PR if repository credentials/remotes permit; report exact evidence and any native behavior not exercised.

### Done when

- hotkey-contract: Hotkey contracts normalize press/release/cancel and expose explicit unsupported or native registration outcomes without fake success.
  Evidence required: Scoped hotkey contract/adapter source and deterministic platform-neutral tests.
- windows-adapter: Windows build contains a concrete global Alt+Space registration and message-loop adapter that emits normalized events and handles release/cancel semantics using an appropriate native mechanism.
  Evidence required: Windows-gated adapter source plus Windows-gated/manual test or documented manual verification path.
- daemon-lifecycle: sorid registers the configured hotkey at startup, truthfully surfaces registration/conflict failure, and unregisters during shutdown.
  Evidence required: Daemon integration source and lifecycle/error tests or checks.
- verification: Formatting, check, clippy, relevant tests, commit, and push/PR evidence are recorded, with unexercised native behavior explicitly identified.
  Evidence required: Command output, git/PR metadata, and repository documentation/report.

### Boundaries

- scoped-files: No audio, Whisper, injection, UI, or E2E script files are changed.
  Evidence required: Diff path inspection.
- no-fake-success: No platform reports successful hotkey registration without an actual supported/native registration result.
  Evidence required: Adapter implementation and error-path tests.
- desktop-free-ci: Automated tests do not require an interactive Windows desktop.
  Evidence required: Test definitions and test execution commands.

## Plan

1. [failed] implement — Implement hotkey boundary
   Kind: work; advances: hotkey-contract, windows-adapter, daemon-lifecycle; next review
2. [completed] review — Review and verify implementation
   Kind: review; advances: hotkey-contract, windows-adapter, daemon-lifecycle, scoped-files, no-fake-success, desktop-free-ci; pass final-review; fail implement
3. [future] final-review — Final acceptance review
   Kind: final-review; advances: hotkey-contract, windows-adapter, daemon-lifecycle, verification, scoped-files, no-fake-success, desktop-free-ci; pass finish; fail stop for parent decision

## What we did

- implement attempt 1: completed
- implement attempt 2: failed; failure subagent_progress_incomplete
- review attempt 1: completed; review fail

## Attempts and lessons

### 1. implement attempt 1

- Recorded: 2026-08-11T10:26:27.861Z
- Route: next to review
- Attempt status: completed

Implementation reports scoped hotkey changes and existing daemon wiring, with core tests and Windows-target check passing. Review independently whether the actual current diff satisfies native registration/release semantics, lifecycle truthfulness, test/documentation requirements, and scope boundaries; do not assume reported claims.

### 2. review attempt 1

- Recorded: 2026-08-11T10:32:40.742Z
- Route: fail to implement
- Attempt status: completed

Review failed: current hotkey.rs only registers RegisterHotKey and maps WM_HOTKEY to press; it lacks a concrete Windows release/cancel mechanism, message loop, and Windows-gated/manual test. sorid main/runtime do not register at startup or unregister on shutdown, nor surface Unsupported on non-Windows. Existing unrelated working-tree edits include excluded audio/Whisper/injection/E2E paths; preserve them and ensure this task's commit/diff contains only scoped paths. Implement the missing native adapter and lifecycle integration, add focused tests/docs, and verify actual current files rather than relying on the prior report. Do not repeat the incomplete host-delegation approach.

## Current state

- Workflow status: reviewing
- Current or next Step: implement

- hotkey-contract: satisfied
- windows-adapter: open
- daemon-lifecycle: open
- verification: open
- scoped-files: violated
- no-fake-success: satisfied
- desktop-free-ci: satisfied

## Next

implement — Implement hotkey boundary

Kind: work
Requirements: hotkey-contract, windows-adapter, daemon-lifecycle
Route: next review
