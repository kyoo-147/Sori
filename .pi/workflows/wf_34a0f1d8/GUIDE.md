# Workflow Guide

Workflow: wf_34a0f1d8 — Sori runtime verification audit
Updated: 2026-08-11T13:32:20.093Z

This runtime-owned Guide preserves the Workflow plan and lessons for successor implementation agents. Read it for orientation, then verify current files and tests. Do not store raw reports, transcripts, credentials, or provider payloads here.

## Goal

Produce the self-contained read-only audit report at data/sori-runtime-verification/report.md for current HEAD after commits 8341f25, 0ba66c0, and bd6f89d. The report must distinguish evidence-backed verified behavior from missing/unverified behavior for the Windows voice runtime, include exact commands/results and commit IDs, cover IPC dictation/Whisper lifecycle, CPAL/VAD daemon reachability, SendInput unsupported/clipboard behavior, hotkey registration/release, history/events, frontend source labels, and stale-daemon false-PASS reproduction where possible. Run safe Rust formatting/check/test/clippy, npm checks, and backend E2E; run native/OCU only when Windows prerequisites are genuinely available and otherwise record explicit SKIP. Do not edit, commit, push, reset, or modify project files except creating the requested report.

### Done when

- report-created: A self-contained report exists at data/sori-runtime-verification/report.md and contains requirement-by-requirement findings.
  Evidence required: Read the report file and verify it is present at the requested path.
- verification-evidence: The report records exact commands, outcomes, commit IDs, and concrete evidence for the scoped runtime boundaries.
  Evidence required: Report sections cite command output or source/test paths for IPC lifecycle, CPAL/VAD reachability, input adapter behavior, hotkeys, history/events, and FE labels.
- missing-work: The report explicitly identifies skipped/unverified areas and states the next unmet requirement without treating preview/fake success as native evidence.
  Evidence required: Report contains explicit SKIP/UNVERIFIED entries and a concrete next requirement.
- no-project-changes: No project files other than the requested report are changed, and no commits/pushes/resets occur.
  Evidence required: Git status/diff evidence shows only the report addition or no unrelated changes; workflow agents are instructed read-only.

### Boundaries

- read-only: Do not edit, commit, push, reset, or alter existing project files; only create the requested report.
  Evidence required: Git status/diff and agent task outcome.
- native-evidence: Do not claim native/OCU verification without genuinely available Windows prerequisites; record explicit SKIP otherwise.
  Evidence required: Report states prerequisite detection and native/OCU outcome.

## Plan

1. [preparing] scout — Inspect and execute audit
   Kind: work; advances: report-created, verification-evidence, missing-work, no-project-changes, read-only, native-evidence; next review-report
2. [completed] review-report — Review audit evidence
   Kind: review; advances: report-created, verification-evidence, missing-work, no-project-changes, read-only, native-evidence; pass final-review; fail scout
3. [future] final-review — Final independent audit review
   Kind: final-review; advances: report-created, verification-evidence, missing-work, no-project-changes, read-only, native-evidence; pass finish; fail stop for parent decision

## What we did

- scout attempt 1: completed
- scout attempt 2: preparing
- review-report attempt 1: completed; review fail

## Attempts and lessons

### 1. scout attempt 1

- Recorded: 2026-08-11T13:30:54.732Z
- Route: next to review-report
- Attempt status: completed

Scout reports the requested report was created and claims Rust/npm/backend checks passed, stale-daemon refusal reproduced, while Whisper, physical CPAL/VAD, hotkey, and SendInput/clipboard remain unverified or skipped. Review the actual file, command evidence, commit identity, and git status carefully; fail back to scout if the report overclaims native/OCU or omits scoped evidence.

### 2. review-report attempt 1

- Recorded: 2026-08-11T13:32:20.093Z
- Route: fail to scout
- Attempt status: completed

Review passed report content, evidence, missing-work, and native-evidence, but failed no-project-changes/read-only because the native build left untracked generated files under apps/desktop/src-tauri/gen/. Recover by removing only those audit-generated artifacts (never touch .pi/ or unrelated files), then verify git status/diff and update the requested report's final workspace-state note if needed. Preserve all evidence and do not rerun mutating native commands.

## Current state

- Workflow status: preparing
- Current or next Step: scout

- report-created: satisfied
- verification-evidence: satisfied
- missing-work: satisfied
- no-project-changes: open
- read-only: violated
- native-evidence: satisfied

## Next

scout — Inspect and execute audit

Kind: work
Requirements: report-created, verification-evidence, missing-work, no-project-changes, read-only, native-evidence
Route: next review-report
