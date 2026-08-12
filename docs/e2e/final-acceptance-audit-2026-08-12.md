# Final acceptance audit — 2026-08-12

## Scope

Independent audit of the desktop product after PRs #68, #69, and #70 landed on `main`.
The audit covered the Rust and npm checks, a real `sorid` loopback session, SQLite lifecycle persistence, all primary desktop routes, resilient and destructive UI states, truthful Diagnostics states, and semantic desktop browser flows.

## Evidence

| Area | Result |
|---|---|
| `npm run check` | PASS — TypeScript build, 41 Vitest tests, desktop typecheck |
| `cargo fmt --all -- --check` | PASS |
| `cargo check --workspace` | PASS |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS |
| `cargo test --workspace` | PASS — 51 Rust tests plus doc tests |
| `npm run e2e:desktop-backend` | PASS — real `sorid`, CLI status/doctor, direct IPC, desktop build |
| Real persistence probe | PASS — lifecycle events remained available after stopping and restarting `sorid` against the same SQLite file |
| `npm run e2e:product` | PASS — real daemon-backed semantic browser flow, all 10 primary routes, empty/loading/error/retry transcripts, delete confirmation, Diagnostics unsupported actions |
| `npm run e2e:desktop-ocu` | PASS — real Tauri/WebView2 OCU flow clicked and asserted all primary routes |

The endpoint-owning E2E commands must run serially. A concurrent run intentionally produced the expected stale-owner/port-collision guard; isolated reruns passed.

## Truthful capability boundary

The following remain **UNVERIFIED**, not product proof: physical global hotkey input, physical microphone capture, Whisper model inference, and focused-app text injection. The audited Doctor response reported Whisper unavailable because no `whisper.cpp` executable was configured. Text injection reported direct SendInput availability while correctly requiring manual focused-target observation and disclosing unsupported clipboard restore/undo.

Native shell evidence proves the Tauri/WebView2 window and semantic navigation only; it does not prove the voice path.

## Actionable findings

1. **Preview success paths remain in production screens.** `apps/desktop/src/App.tsx` uses browser `SpeechRecognition` and a timed sample transcript, and `OverviewScreen` labels the control `Simulate Dictation`. These are explicitly described as preview-only in the UI and were not counted as dictation evidence, but should remain isolated or be removed before claiming an install-to-dictation MVP.
2. **Onboarding still simulates hardware permission and injection success.** `FirstRunOnboardingScreen.tsx` contains simulated hotkey/injection flow and the string `Sori successfully injected text into target window!`. This is a misleading success claim unless the screen stays clearly prototype-only; the audited primary-route gate intentionally excludes it.
3. **Runtime mock fallback remains a browser-preview path.** `runtime-client.ts` can return `Mock fallback` after IPC failure. Real-daemon E2E correctly asserted `Backend` and absence of `Mock fallback`; no change was made because the fallback is documented preview behavior, but production packaging must not silently rely on it.

No hardware/native capability is claimed by this audit. No regression code change was necessary; this document records the independent acceptance evidence and the remaining remediation boundary.
