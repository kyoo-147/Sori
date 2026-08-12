# Sori Windows voice-runtime verification audit

**HEAD:** `bd6f89d0fedd451954a8a810e74df26ddf905b77` (`bd6f89d`, current `main`). Audited after `8341f2535c3bd399186c9b20c36b122712880749` (`8341f25`, truthful local transcription), `0ba66c03ffa787138d03979ad5c91903c73f5b9a` (`0ba66c0`, SendInput adapter), and `bd6f89d0fedd451954a8a810e74df26ddf905b77` (CPAL lifecycle).

## Result

Loopback daemon/JSON IPC, SQLite persistence, Rust and TypeScript checks, native Tauri launch, and OCU semantic navigation are verified. The complete microphone -> VAD -> Whisper -> text-injection path is **not verified**: no Whisper executable/model was available, no physical microphone was exercised, daemon hotkey/text-injection integration is absent, and Windows clipboard fallback is explicitly unsupported. Fake/mock/preview success is not native voice evidence.

## Commands and exact outcomes

- `git rev-parse HEAD` => `bd6f89d0fedd451954a8a810e74df26ddf905b77`.
- `git show -s --format='%H %s' 8341f25 0ba66c0 bd6f89d` => all three requested commit IDs/titles matched the commits above.
- `cargo fmt --all --check` => PASS, no output.
- `cargo check --workspace` => PASS, `Finished dev profile`.
- `cargo test --workspace` => PASS: audio 2, core 23, IPC 4, persistence 3, Whisper 10, sorid 5; all `ok` (also zero-test binaries/doc tests).
- `cargo clippy --workspace --all-targets -- -D warnings` => PASS, `Finished dev profile`.
- `npm run check` => PASS: TypeScript build, Vitest 16 files/44 tests, and desktop check/build.
- `npm run e2e:desktop-backend` => PASS. Real sorid reached `127.0.0.1:17373`; status, direct IPC, SQLite, and desktop compatibility passed. Doctor output: daemon/ipc-bind/sqlite `ok`; hotkey failed (native adapter not wired); audio failed in that run; Whisper failed (executable not found); text-injection failed (native adapter not wired).
- `npm run e2e:desktop-native` => PASS. Windows Tauri debug app connected to real sorid; four screenshots were captured, `3/4` visual states were unique, and processes were cleaned up. This proves shell/IPC/UI only.
- `npm run e2e:desktop-ocu` => PASS. OCU asserted Home, Transcripts, Vocabulary, Voice Edit, Models & Routing, Benchmarks, Extensions, Privacy, Diagnostics, and Settings. This is semantic UI evidence only.
- Stale-daemon attempt: started `target/debug/sorid.exe` on `127.0.0.1:17373` using `.tmp/stale-audit.db`, then ran `npm run e2e:desktop-backend`; it exited `1` with `FAIL: refusing to run against stale daemon already owning http://127.0.0.1:17373/ipc`. The guard prevented a stale-daemon false PASS; no false PASS was reproduced.

## Requirement findings

### IPC, dictation, Whisper lifecycle — PARTIAL; native transcript UNVERIFIED

`crates/sori-ipc/src/lib.rs` defines DictationStart/Stop/Cancel and Dictation(model,audio), loopback-only LocalIpcServer, protocol version 1, and RecentEvents. `crates/sorid/src/main.rs` maps those requests to runtime start/stop/cancel/transcribe; stop explicitly says no transcript was produced. `crates/sorid/src/runtime.rs` publishes audio/VAD lifecycle events and terminal shutdown/error transitions. `crates/sori-provider-whisper/src/lib.rs` discovers an external CLI, writes WAV, supervises cancellation/timeout, parses text/JSON/SRT, and cleans temporary files. Unit tests pass.

**SKIP/UNVERIFIED:** `whisper-cli.exe`, `whisper-cli`, and `main.exe` were absent from PATH; no model was supplied. Fake runner/parser tests prove contracts only, not a real process or transcript.

### CPAL/VAD reachability — PARTIAL; hardware UNVERIFIED

`crates/sori-audio/src/lib.rs` implements CPAL discovery, F32/I16/U16 stream handling, mono conversion, bounded worker channels, start/stop, and errors. `crates/sorid/src/runtime.rs` starts capture only after CPAL start succeeds, consumes up to 64 chunks, applies `EnergyVadStub`, and publishes AudioStarted, AudioChunkCaptured, VadSpeechStarted/Ended, AudioStopped, or AudioError. CPAL callback tests and fake-capture/VAD tests passed.

No native device enumeration/recording was performed (`pactl` was unavailable and no safe microphone fixture was available). Physical CPAL start, permissions, and VAD remain **UNVERIFIED**; the current VAD is an energy stub, not Silero evidence.

### SendInput, unsupported targets, clipboard — policy verified; native side effects UNVERIFIED

`crates/sori-core/src/text_injection.rs` contains Windows UTF-16 SendInput and checks sent-event counts/errors. `WindowsTextInjector::native()` advertises direct input only (`clipboard=false`, restore=false, undo=false). Unsupported/elevated targets are rejected; clipboard fallback requires restore, and restore failure cannot report success. Tests cover direct selection, fallback policy, no-restore refusal, restore failure, unsupported/elevated targets, and dry-run side-effect freedom; all passed.

The Windows adapter methods state `Windows clipboard fallback is not wired; direct SendInput only`; undo is also not wired. No focused external target was used and no SendInput or clipboard side effect was attempted. Native input/clipboard behavior is **SKIP/UNVERIFIED**.

### Hotkey registration/release — source and fake tests verified; native integration UNVERIFIED

`crates/sori-core/src/hotkey.rs` implements Win32 RegisterHotKey/UnregisterHotKey, conflict code 1409, WM_HOTKEY handling, and state reset on stop. Fake tests verify registration, conflict, hold-once, release, and cancellation; all passed. The daemon doctor explicitly reports `hotkey: failed (unavailable: native global hotkey adapter is not wired)`. No physical Alt+Space test was run: **SKIP/UNVERIFIED**.

### History/events — persistence/contracts verified; real voice record UNVERIFIED

`crates/sori-core/src/event.rs` enumerates audio, VAD, hotkey, ASR, transcript, daemon, and action events. `crates/sori-ipc/src/lib.rs` exposes RecentEvents; `crates/sorid/src/main.rs` persists/returns them via SQLite. Persistence tests cover event ordering/history round trips; IPC tests cover RecentEvents and loopback; backend E2E proved SQLite migration and IPC reachability. A complete native dictation did not occur, so real transcript history and its full event chain are **UNVERIFIED**. `apps/desktop/src/components/screens/TranscriptsScreen.tsx` renders supplied UI history and copy/delete/reinsert actions, not proof of daemon hydration.

### Frontend source labels — verified

`apps/desktop/src/runtime-client.ts` defines `native | backend | mock | unavailable`, prefers Tauri then HTTP, and only uses MockRuntimeClient after status failure. `apps/desktop/src/components/DesktopTitleBar.tsx` labels Native, Backend, Mock fallback, and Unavailable, and disables mock daemon controls. Build, native shell, and OCU checks passed. Labels identify transport source, not capability health.

## Prerequisites, skips, and safety

Environment detection found Windows_NT x86_64, Cargo/Rust, Node/npm, PowerShell, a Tauri binary/build path, and OCU package `open-computer-use@0.3.1`. No Whisper executable/model or proven microphone fixture was available. Therefore Whisper, physical CPAL/VAD, physical hotkey, focused-target SendInput, and clipboard tests were explicitly skipped/unverified. No claim of native voice success is based on preview, fake runner, mock, screenshot, or OCU results.

Before audit, `git status --short` showed only pre-existing `?? .pi/`; no tracked diff. No commit, push, reset, checkout, stash, restore, clean, or history operation was performed. The native Tauri build left four untracked JSON schema files under `apps/desktop/src-tauri/gen/schemas/` (`acl-manifests.json`, `capabilities.json`, `desktop-schema.json`, and `windows-schema.json`); `git ls-files -- apps/desktop/src-tauri/gen` returned no tracked paths, and their same-run timestamps identified them as generated audit artifacts. Those four files and their now-empty `gen/schemas/` and `gen/` directories were removed, without touching `.pi/` or other untracked files. Final status after cleanup was:

```text
?? .pi/
?? data/
```

`data/` is the requested report. `.pi/` remains pre-existing harness state; no tracked project diff exists.

## Next unmet requirement

Install a real `whisper-cli.exe` and valid model, provide a real input device and safe focused target, then wire/register daemon hotkey and text-injection adapters and run one controlled Alt+Space hold/release proving CPAL start, VAD events, Whisper transcript, SendInput/clipboard restore behavior, persisted history/events, and truthful UI capability labels. Until then the Windows voice runtime remains partially verified.
