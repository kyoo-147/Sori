# Worker F focused target and text injection report — 2026-08-13

## Result

**IMPLEMENTED / NATIVE INSERTION UNVERIFIED.** The Windows injection boundary now uses UTF-16 `SendInput`, identifies the foreground HWND and owning PID immediately before input, releases modifier keys before and after injection, and rejects a changed target identity. Clipboard fallback is transactional for `CF_UNICODETEXT`, restores an empty clipboard state, and reports restore failures instead of claiming success. No native Notepad, browser, editor, or terminal insertion is claimed from this worker run.

## Delivery

- Branch: `worker-f/focused-target-injection`
- Commit: `67fdede` (plus this report)
- Pull request: https://github.com/kyoo-147/Sori/pull/104
- Scope: `crates/sori-core/src/text_injection.rs`, `crates/sorid/src/main.rs`, `docs/backend/text-injection.md`, this report

## Implementation evidence

| Requirement | Evidence | Outcome |
| --- | --- | --- |
| Direct Unicode input | `crates/sori-core/src/text_injection.rs:400-445` | UTF-16 units are sent as paired key-down/key-up `SendInput` events; partial sends return an error. |
| Foreground target | `crates/sori-core/src/text_injection.rs:630-648` | `GetForegroundWindow` plus `GetWindowThreadProcessId` produces `pid:<pid>;hwnd:<hwnd>` immediately before input. |
| Target race protection | `crates/sori-core/src/text_injection.rs:252-267`; test at `:876-901` | Caller identity mismatch returns `FocusedTargetChanged` before text input. |
| Modifier safety | `crates/sori-core/src/text_injection.rs:598-628` | Control, Shift, Alt, and Win key-up events are sent before and after the transaction. |
| Clipboard fallback | `crates/sori-core/src/text_injection.rs:450-520`, `:568-594`, `:650-686` | CF_UNICODETEXT snapshot, paste, payload check, conditional restore, and truthful errors. |
| Runtime integration | `crates/sorid/src/main.rs:20-29`, `:60-90` | Runtime target advertises direct input and clipboard fallback; Windows uses the native adapter. |
| Unsupported/elevated outcomes | `crates/sori-core/src/text_injection.rs:708-724` | Unsupported targets and denied elevation return explicit errors; no fake success. |
| Manual matrix | `docs/backend/text-injection.md:22-43` | Notepad, VS Code, browser, chat, terminal, elevated, and unsupported target checks are documented. |

## Deterministic validation

All commands were run from `C:/Users/hoang/.treehouse/Sori-85ff33/8/Sori`:

- `cargo fmt --all -- --check` — PASS
- `cargo check --workspace` — PASS
- `cargo check -p sori-core --target x86_64-pc-windows-msvc` — PASS
- `cargo test -p sori-core` — PASS, 27 tests
- `cargo clippy -p sori-core --all-targets -- -D warnings` — PASS
- `git diff --check` — PASS

The focused test specifically verifies that a changed foreground identity prevents direct input. Dry-run, strategy selection, clipboard restore failure, elevated-target denial, and unsupported-target behavior are also covered.

## Native/hardware boundary

**UNVERIFIED / SKIP:** this run did not prove Windows foreground activation, real Notepad insertion, browser/editor insertion, terminal safety, clipboard preservation against a user's live clipboard, microphone capture, hotkey delivery, Whisper capture transcription, or end-to-end daemon-to-focused-app dictation. `SendInput` returning a full event count only proves Windows accepted the events; it does not prove the target rendered the text. Browser previews, fake adapters, and deterministic tests are not native proof.

The required native matrix remains an opt-in Windows run with the target PID captured immediately before input and the inserted marker read back from the actual target. Elevated applications must remain denied unless matching integrity access is explicitly established; UAC is never bypassed.

## Reference/license evidence

The implementation follows the Microsoft Win32 contracts for `SendInput`, foreground-window/PID lookup, and clipboard APIs. Rust bindings are provided by the existing `windows-sys` dependency (`Cargo.toml`, `Cargo.lock`); no third-party implementation code was copied. The dependency's published license metadata is the applicable license evidence.

## CI status

PR #104 is open. Local deterministic validation above is green. GitHub reported one failed check at review time, but its job log was unavailable through `gh run view`; this is recorded rather than treated as a passing native check.
