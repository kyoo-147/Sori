# Workflow Guide

Workflow: wf_e6827205 — Repair truthful desktop E2E harness
Updated: 2026-08-11T10:57:05.842Z

This runtime-owned Guide preserves the Workflow plan and lessons for successor implementation agents. Read it for orientation, then verify current files and tests. Do not store raw reports, transcripts, credentials, or provider payloads here.

## Goal

Repair the desktop E2E harness in scripts/e2e-desktop-backend.ts, scripts/e2e-desktop-native.ts, scripts/e2e-desktop-ocu.ts, related E2E tests, and related E2E docs only. Reconcile the current uncommitted target-file changes and stale Firstmate launch state. Ensure stale endpoint/port reproduction fails, daemon startup/bind failures are detected before endpoint acceptance, endpoint ownership is proven by the spawned child, descendants are always terminated, endpoint/database isolation is used where supported and never falsely claimed, non-Windows native/OCU are explicit SKIP rather than PASS, assertions use current UI/backend labels without accommodating mocks, and evidence includes the required sequential testcase matrix plus truthful viewport/screenshot/artifact hashes. Do not modify production runtime files or unrelated worker changes. Verify with applicable tests/scripts and npm check, then commit only the owned target/docs/tests changes and push the direct PR if repository credentials and policy permit; otherwise report the exact blocker and evidence.

### Done when

- truthful-process-ownership: Backend/native/OCU harnesses reject stale responding endpoints and accept readiness only when the endpoint is demonstrably owned by the spawned daemon, with startup/bind failure surfaced.
  Evidence required: Target scripts and tests; deliberate stale-port reproduction command/output showing nonzero failure; clean-run manifest showing child PID ownership.
- descendant-cleanup: All harness paths terminate desktop and daemon descendants on success, failure, and signals, and cleanup failures are not hidden.
  Evidence required: Target scripts plus process-tree/cleanup test or command evidence.
- truthful-platform-semantics: Native and OCU paths explicitly SKIP on unsupported non-Windows platforms and never PASS there; supported paths use current source labels and fail on unsupported/mocked semantic state.
  Evidence required: Target scripts/docs/tests and applicable execution output.
- evidence-matrix: Documentation and generated manifests describe and capture sequential backend IPC, pause/resume/diagnostics, desktop build, native launch, viewport/responsive sizes, OCU semantic navigation, and screenshot hashes/artifacts without fabricated measurements.
  Evidence required: Related docs, manifests/artifact hashes, and tests or script output.
- verification-scope: Applicable E2E tests/scripts and npm check pass with exact PASS/SKIP semantics, and only owned scope is committed/pushed.
  Evidence required: Command logs, git diff/status, commit and push evidence or exact push blocker.

### Boundaries

- owned-files-only: No production runtime implementation or unrelated worker modifications are changed, staged, committed, or reverted.
  Evidence required: git diff --name-only and staged diff restricted to scripts/e2e-desktop-*.ts, related E2E tests/docs, and required owned support files.
- no-false-positive: Mocks, stale daemons, unsupported native paths, and unmeasured viewport claims cannot be reported as PASS.
  Evidence required: Tests and deliberate negative-path output.

## Plan

1. [completed] audit-current-state — Audit current harness and launch state
   Kind: work; advances: truthful-process-ownership, truthful-platform-semantics, evidence-matrix; next repair-harness
2. [completed] repair-harness — Repair scripts tests and docs
   Kind: work; advances: truthful-process-ownership, descendant-cleanup, truthful-platform-semantics, evidence-matrix; next review-harness
3. [preparing] review-harness — Review harness behavior and scope
   Kind: review; advances: truthful-process-ownership, descendant-cleanup, truthful-platform-semantics, evidence-matrix; pass verify-and-package; fail repair-harness
4. [future] verify-and-package — Run verification and prepare change
   Kind: work; advances: verification-scope, owned-files-only; next final-review
5. [future] final-review — Final independent acceptance review
   Kind: final-review; advances: truthful-process-ownership, descendant-cleanup, truthful-platform-semantics, evidence-matrix, verification-scope, owned-files-only, no-false-positive; pass finish; fail stop for parent decision

## What we did

- audit-current-state attempt 1: completed
- repair-harness attempt 1: completed
- repair-harness attempt 2: completed
- repair-harness attempt 3: completed
- review-harness attempt 1: completed; review fail
- review-harness attempt 2: completed; review fail
- review-harness attempt 3: preparing

## Attempts and lessons

### 1. audit-current-state attempt 1

- Recorded: 2026-08-11T10:25:41.399Z
- Route: next to repair-harness
- Attempt status: completed

Audit found concrete false-positive risks: native/OCU wait for any same-named window rather than spawned PID; native readiness swallows daemon exits; netstat matching is imprecise; helper processes are untracked; failure evidence/manifests and ownership measurements are incomplete; native responsive matrix is missing. Targeted tests pass but no E2E run occurred. Repair only scripts/e2e-desktop-*.ts, related E2E tests/docs; do not touch unrelated runtime or .pi/.firstmate state. Preserve strict current-label assertions and explicit non-Windows SKIP.

### 2. repair-harness attempt 1

- Recorded: 2026-08-11T10:36:41.288Z
- Route: next to review-harness
- Attempt status: completed

Implementer reports changes to the three harness scripts and backend tests, focused tests and script TypeScript check pass, but full npm check, Windows E2E, and stale-port reproduction remain unverified. Review the actual diff and current docs for completeness; pay special attention to helper descendant cleanup, spawned window PID ownership, failure manifests, responsive evidence matrix, exact platform SKIP, and scope boundaries.

### 3. review-harness attempt 1

- Recorded: 2026-08-11T10:38:00.675Z
- Route: fail to repair-harness
- Attempt status: completed

Review failed all scoped repair areas. Do not repeat response-only endpoint checks or process-name window lookup. The next repair must: use exact listener PID evidence and record it; surface child exit/bind stderr before readiness; bind window checks to spawned app PID; track/clean helper descendants on signals and propagate cleanup failures; remove any early PASS; generate guarded failure and success manifests with explicit sequential testcase rows, truthful measured native dimensions and screenshot/artifact hashes, and OCU viewport SKIP; add negative-path evidence/tests. Preserve strict source labels, explicit non-Windows SKIP, and never alter unrelated runtime files.

### 4. repair-harness attempt 2

- Recorded: 2026-08-11T10:45:50.602Z
- Route: next to review-harness
- Attempt status: completed

The second repair changed backend/tests/docs but explicitly reports native and OCU were reverted/reset and their review failures remain. Review must inspect the actual workspace, verify whether backend fixes landed, and route fail unless all current-step requirements are genuinely satisfied across all three harnesses. Preserve scope and do not infer completion from the implementer report.

### 5. review-harness attempt 2

- Recorded: 2026-08-11T10:48:28.562Z
- Route: fail to repair-harness
- Attempt status: completed

Review still fails every requirement, and the deliberate stale-port reproduction demonstrated the current backend emits PASS after sorid bind error 10048. The next repair must replace the current implementation across all three scripts, not only backend: exact listener PID ownership and startup diagnostics; tracked helper/process-tree cleanup with signal handling and propagated failures; spawned-PID window checks; exact SKIP; complete guarded manifests and sequential evidence rows; and tests/docs matching reality. Existing unrelated production changes and .pi/.firstmate state remain out of scope and must not be reverted or staged.

### 6. repair-harness attempt 3

- Recorded: 2026-08-11T10:57:05.842Z
- Route: next to review-harness
- Attempt status: completed

A third repair reports all three scripts, tests, and docs changed, with stale-port rejection and focused tests, but native/OCU full runs are blocked by unrelated Rust compilation. Treat this as untrusted until reviewing the actual diff. Verify that the reported fixes really replaced response-only readiness, process-name window lookup, hidden cleanup, missing manifests/matrix, and contradictory PASS; also verify scope is not staged or altered beyond owned files.

## Current state

- Workflow status: preparing
- Current or next Step: review-harness

- truthful-process-ownership: open
- descendant-cleanup: open
- truthful-platform-semantics: open
- evidence-matrix: open
- verification-scope: open
- owned-files-only: open
- no-false-positive: open

## Next

review-harness — Review harness behavior and scope

Kind: review
Requirements: truthful-process-ownership, descendant-cleanup, truthful-platform-semantics, evidence-matrix
Route: pass verify-and-package; fail repair-harness
