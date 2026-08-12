# Workflow Guide

Workflow: wf_cbaff462 — Sori v1 runtime launch slice
Updated: 2026-08-11T10:48:28.960Z

This runtime-owned Guide preserves the Workflow plan and lessons for successor implementation agents. Read it for orientation, then verify current files and tests. Do not store raw reports, transcripts, credentials, or provider payloads here.

## Goal

Consolidate the current Sori runtime iteration into one truthful, buildable, verified vertical slice. Preserve all existing uncommitted work; inspect current primary worktree diff, commits, worker reports, and source state before changes. Own runtime changes across crates/sori-core, crates/sori-audio, crates/sori-provider-whisper, crates/sorid, E2E scripts/tests/docs as needed; UI changes only for truthful backend/native/unavailable labels. Remove mock-only success semantics outside tests/offline preview while preserving local-only IPC and existing API contracts. Implement real Windows hotkey lifecycle with truthful conflict/startup/shutdown and press/release/cancel semantics or explicit non-Windows unsupported diagnostics; instantiate or expose real CPAL capture/VAD session lifecycle from sorid without unconditional fake transcripts; make Whisper encode PCM WAV, invoke configured binary/model through real process runner, parse output, timeout/cancel, clean temp files, and fail missing prerequisites explicitly with reachable daemon/provider wiring; implement cfg(windows) SendInput Unicode injection and transactional Win32 clipboard fallback, with explicit non-Windows unsupported behavior and side-effect-free dry-run; make E2E scripts reject stale daemon/port/process ownership and never PASS unsupported native/OCU paths while preserving screenshot/viewport/semantic evidence. Verify with cargo fmt/check/test/clippy and npm build/test/check, run backend E2E, and on Windows native/OCU E2E with artifacts or otherwise explicit SKIP. Inspect scope/secrets, commit the verified coherent set with a Conventional Commit subject, push branch, and report commit/remote plus exact command evidence without claiming unexercised external injection or microphone/Whisper success.

### Done when

- state-inspected: Current primary worktree diff, recent commits, worker reports, and relevant source/test state have been inspected and preserved.
  Evidence required: Inspection report and git status/diff/log outputs recorded in workflow guide; no reset/discard operation used.
- runtime-truthful: The runtime vertical slice has real or explicitly unsupported hotkey, capture/VAD, Whisper, and text injection behavior with no unconditional fake success path and preserved local IPC/API contracts.
  Evidence required: Source diff plus targeted tests/checks demonstrate platform gating, lifecycle/cancellation/error behavior, reachable wiring, and dry-run safety.
- e2e-honest: E2E scripts enforce ownership/staleness checks and do not mark unsupported native/OCU paths PASS while retaining required evidence artifacts.
  Evidence required: E2E source inspection and executed backend/native/OCU results, with explicit SKIP where platform-inapplicable.
- verified-delivery: The coherent change passes applicable formatting/build/test/lint checks, scope/secrets review, and is committed and pushed.
  Evidence required: Exact command results, final diff/status inspection, Conventional Commit hash, and remote push output.

### Boundaries

- preserve-work: No existing uncommitted work is reset, discarded, or blindly overwritten.
  Evidence required: Git status/diff before and after, and workflow guide inspection notes.
- api-ipc: Existing local-only IPC and API contracts remain intact.
  Evidence required: Relevant interface diff review and tests.
- no-overclaim: No unexercised Notepad/VS Code/browser injection or microphone/Whisper success is claimed.
  Evidence required: Final report distinguishes implemented, tested, skipped, and unexercised behavior.
- single-worker: Implementation is performed sequentially by the active worker without nested workflows or parallel edits.
  Evidence required: Workflow activity shows one agent per work step and no nested workflow delegation.

## Plan

1. [failed] inspect-state — Inspect current state
   Kind: work; advances: state-inspected, preserve-work; next implement-slice
2. [future] implement-slice — Implement truthful vertical slice
   Kind: work; advances: runtime-truthful, api-ipc, preserve-work; next verify-slice
3. [future] verify-slice — Verify and deliver
   Kind: work; advances: e2e-honest, verified-delivery, no-overclaim, api-ipc; next final-review
4. [future] final-review — Final independent review
   Kind: final-review; advances: state-inspected, runtime-truthful, e2e-honest, verified-delivery, preserve-work, api-ipc, no-overclaim, single-worker; pass finish; fail stop for parent decision

## What we did

- inspect-state attempt 1: failed; failure subagent_progress_incomplete

## Attempts and lessons

- No parent synthesis recorded yet.

## Current state

- Workflow status: reviewing
- Current or next Step: inspect-state

- state-inspected: open
- runtime-truthful: open
- e2e-honest: open
- verified-delivery: open
- preserve-work: open
- api-ipc: open
- no-overclaim: open
- single-worker: open

## Next

inspect-state — Inspect current state

Kind: work
Requirements: state-inspected, preserve-work
Route: next implement-slice
