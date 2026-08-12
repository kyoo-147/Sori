# Sori MVP truth plan

**Audit date:** 2026-08-11  
**Auditor:** sole scout (read-only)  
**Repository:** `D:\work\Sori`  
**Reference:** `D:\work\navin\Screenshot 2026-08-11 124501.png`

## Executive status and evidence rules

This is an implementation and verification plan, not a completion report. The repository has a working Rust lifecycle/loopback/SQLite scaffold and a native React/Tauri shell, but the product hot path is not complete. In particular, the daemon doctor currently reports native hotkey and text injection unavailable; Whisper depends on an external executable and model; the UI contains substantial local preview state. A fake, fixture, browser Speech API, screenshot, accessibility tree, or unit test is not evidence of a real Windows dictation journey.
**Review status:** this report records the scout audit and planned verification only. The independent acceptance review was not completed because the Firstmate subagent runtime repeatedly failed with `ENOENT` for `C:\Users\hoang\.pi\agent\extensions\subagent.ts`; therefore no reviewer pass is claimed. The plan remains the implementation target and must be re-reviewed when that infrastructure is repaired.

Terms used below:

- **Observed:** directly read from the current tree or an executed command result.
- **Assumption:** an implementation choice to confirm before coding.
- **Planned:** work not present at audit time.
- **Unavailable/skipped:** deliberately not claimed because a prerequisite or integration is absent.

## 1. Repository and working-tree audit

### Current state

Observed commands and results:

```text
git status --short --branch
## main...origin/main
?? .pi/
?? data/

git log -1 --oneline
bd6f89d feat(audio): wire CPAL dictation lifecycle

git diff --stat
(empty)
```

`git rev-parse HEAD` is `bd6f89d0fedd451954a8a810e74df26ddf905b77`. The baseline had no tracked diff. `data/sori-runtime-verification/report.md` is also present as an untracked artifact, and the current status lists 13 untracked `.pi/workflows/*/GUIDE.md` files (including the runtime-owned Guide for this workflow). These are observed workflow/runtime or prior-audit artifacts; Git history alone cannot prove when each was created. They are not product completion evidence. This retry changed only `data/sori-mvp-truth-plan/report.md`; it did not create, edit, or delete those other paths. Final evidence must include `git status --short --untracked-files=all`, `git diff --stat`, `git diff --name-only`, and a content comparison of the requested report; an untracked report will not appear in ordinary `git diff`.

Rules read: `AGENTS.md` requires routing project work through Firstmate, default Pi/GPT 5.6 Luna/Herdr, and prohibits relaxing early MVP approval discipline. Runtime-owned workflow guide read: `.pi/workflows/wf_ad4f4744/GUIDE.md`; it confirms this read-only scout scope and says not to modify the Guide. No commit, push, reset, checkout, restore, clean, stash, merge, rebase, cherry-pick, revert, subagent, or nested workflow was invoked.

### Surface inventory

- Root manifests: `Cargo.toml`, `Cargo.lock`, `package.json`, `package-lock.json`, `rust-toolchain.toml`, `tsconfig.json`, `.env.example`.
- Frontend: `apps/desktop/src/App.tsx`, `types.ts`, `ipc-contract.ts`, `runtime-client.ts`, `preferences.ts`, `data/initialData.ts`, `index.css`, all components under `apps/desktop/src/components/`, and the reference-only parallel tree under `apps/desktop/design-reference/`.
- Native shell: `apps/desktop/src-tauri/src/lib.rs` and `main.rs`, `tauri.conf.json`; Tauri exposes only `sori_ipc`, forwards a request to `LocalIpcClient`, and does not own window controls.
- Rust workspace: `crates/sori-core`, `sori-ipc`, `sorid`, `sori-audio`, `sori-provider-whisper`, `sori-persistence`, `sori-cli`.
- TypeScript HTTP/tray foundation: `src/adapters/http/{app,server}.ts`, `src/adapters/storage/memory.ts`, `src/tray/{client,protocol,mock-shell}.ts`, modules under `src/modules/`, and `src/frontend/ipc-bridge.ts`.
- Tests/scripts: `tests/*.test.ts`, `scripts/e2e-desktop-{backend,native,ocu}.ts`, Rust unit tests in each crate, `.github/workflows/ci.yml`.
- Docs audited include `README.md`, `docs/mvp-capability-matrix.md`, `docs/architecture.md`, `docs/dictation-pipeline.md`, backend audio/daemon/IPC/persistence/Whisper/hotkey/injection docs, frontend IPC/shell/E2E docs, and `data/sori-runtime-verification/report.md`.

## 2. Runtime and persistence truth

### Frontend and IPC

`apps/desktop/src/runtime-client.ts` has `NativeIpcTransport` (Tauri `invoke('sori_ipc')`), `HttpIpcTransport` (`POST http://127.0.0.1:17373/ipc`), fallback selection in `DesktopIpcTransport`, and explicit `RuntimeSource = native | backend | mock | unavailable`. `RuntimeClient` falls back to `MockRuntimeClient` after status failure; mock status says running/idle/profile Coding/version mock and doctor says `mock runtime preview` plus failed `real sorid IPC unavailable`. This is an observed preview fallback, not daemon health.

`apps/desktop/src/ipc-contract.ts` mirrors Rust externally tagged serde. Its TypeScript `IpcOperation` currently includes only status, doctor, config summary, recent events, pause, and resume. Rust `crates/sori-ipc/src/lib.rs` additionally defines `DictationStart`, `DictationStop`, `DictationCancel`, and `Dictation { model, audio }`, but the desktop client does not expose those operations. It implements loopback-only HTTP and a test-only `MockIpcServer`; mock dictation explicitly returns an error.

`apps/desktop/src-tauri/src/lib.rs` is a thin JSON forwarder. `apps/desktop/src-tauri/tauri.conf.json` sets title `Sori`, 1100x720, minimum 720x480, and does not set a custom frame/decorations or window-control commands. Therefore native OS chrome still owns minimize/maximize/close.

### Daemon, audio, ASR, injection, hotkey

- `crates/sorid/src/main.rs` opens/migrates SQLite, discovers optional Whisper, configures CPAL if possible, binds `127.0.0.1:17373`, serves Status/Doctor/ConfigSummary/RecentEvents/Pause/Resume and dictation start/stop/cancel/transcribe. Stop currently says “no transcript was produced”; the daemon never calls the full `run_dictation` pipeline or injection adapter.
- `crates/sorid/src/runtime.rs` has lifecycle state, CPAL engine attachment, start/stop capture, up-to-64 chunk consumption, `EnergyVadStub`, and audio/VAD events. It is real code with fake-capture tests, but physical device permission/start and a complete ASR session are unverified.
- `crates/sori-audio/src/lib.rs` implements CPAL device discovery, F32/I16/U16 conversion, channel mixing, bounded worker channels, start/stop, and callback tests. It is not evidence that this host has a usable microphone.
- `crates/sori-provider-whisper/src/lib.rs` discovers `whisper-cli(.exe)`/`main(.exe)` from environment/PATH, validates optional model directory, writes WAV, executes externally, parses txt/JSON/SRT, supervises timeout/cancellation, and cleans temporary files. No executable/model is bundled. The prior runtime verification report records Whisper absent and real transcription skipped.
- `crates/sori-core/src/hotkey.rs` defines a tested state machine and a Windows `RegisterHotKey`/`WM_HOTKEY` boundary, but `sorid` does not instantiate/register it. Doctor says `hotkey: failed (native global hotkey adapter is not wired)`.
- `crates/sori-core/src/text_injection.rs` defines policy, dry-run, direct-input/clipboard strategy, Windows UTF-16 `SendInput`, elevation checks, and fake tests. `WindowsTextInjector::native()` advertises direct input only; clipboard fallback and undo explicitly return “not wired”. `sorid` does not call it. Doctor says text injection unavailable.
- `crates/sori-core/src/pipeline.rs` contains a testable `run_dictation(audio, asr, injector, target, route, history, events)` that persists history and records injection fallback, but it is not wired to the daemon IPC requests.
- `crates/sori-core/src/hotkey.rs`, `text_injection.rs`, and `pipeline.rs` are policy/contracts and test harnesses; they do not establish OS integration.

### Persistence

`crates/sori-persistence/src/lib.rs` applies `001_initial.sql` and stores history, events, settings, model manifests, and model routes. `sorid` uses `sori.db` by default or `SORI_DATABASE_PATH`/`SORI_DB_PATH`; events are persisted and exposed by RecentEvents. The UI instead initializes `history` from `apps/desktop/src/data/initialData.ts` and only persists settings/extensions/deviceView through browser `localStorage` in `preferences.ts`. It does not hydrate history, dictionary, models, routes, voice profile, assistant voice, benchmarks, or settings through Rust persistence. The visible privacy delete action clears React state only and says “from this UI session.”

The separate TypeScript HTTP app (`src/adapters/http/app.ts`) persists projects/artifacts/runs to in-memory repositories, not the Rust voice runtime or SQLite. It is a separate foundation and not an FE↔daemon implementation.

## 3. Mock/sample/preview inventory and classification

Classification is **R = production behavior to replace**, **F = legitimate offline/demo fixture**, **U = explicit unavailable state**.

| Path | Observed behavior | Class | Required truth |
|---|---|---:|---|
| `apps/desktop/src/data/initialData.ts` | hard-coded models/routes/dictionary/snippets/extensions/history/benchmark results/default profiles | R (when shown as current data) | Load each production entity from daemon/SQLite; keep only a clearly labelled demo seed mode. |
| `apps/desktop/src/runtime-client.ts` `MockRuntimeClient` | running mock status, mock doctor, pause/resume in memory after loopback failure | F/U | Keep fallback only if visibly labelled; never imply real capture/ASR/injection. Prefer explicit unavailable for MVP production shell. |
| `apps/desktop/src/App.tsx` Web Speech effect | browser `SpeechRecognition`/`webkitSpeechRecognition` appends synthetic-looking history | R | Replace with IPC dictation start/audio/stop/transcript/history flow; browser path must say preview/unavailable. |
| `App.tsx` `toggleListening` | timeout inserts “Short, friendly email...” interim text | R | Remove from production action; call daemon and report permission/device/provider errors. |
| `App.tsx` `OverlaySimulator` | named simulator, fake active target/model/interim transcript | F/U | Legitimate demo fixture only; production overlay must consume runtime events. |
| `components/OverlaySimulator.tsx` | alert simulates Windows settings; “Voice Edit Preview”; style controls | F/U | Keep alerts as explicit unavailable or wire Tauri OS-settings launch; no success claim. |
| `OverviewScreen.tsx` | `activeAppMock`, textarea target, “Simulate Dictation”, prompt snippets, local insertion | F | Offline UI demo only; production must use active-window context + text injection IPC, otherwise unavailable. |
| `FirstRunOnboardingScreen.tsx` | fixed Realtek/Mac/USB choices, level values, `injectionGranted=true`, timer-based mic/hotkey/test text and success | R | Replace with device enumeration, OS permission result, native hotkey test, and real safe-target injection. Current success strings are not truthful. |
| `BenchmarkScreen.tsx` | timer progress/logs and preloaded 3-model results | R | Run a backend benchmark against installed models/audio fixtures; label synthetic fixture results and persist run. |
| `ModelManagerScreen.tsx` | initial model/provider catalog and local state toggles | R | Model manifest/install/remove/route IPC + persistence; unavailable if provider/download not implemented. |
| `ExtensionsSandboxScreen.tsx` | `initialExtensions`, local enable/disable/configure; text explicitly says preview/runtime absent | U/F | Correctly explicit unavailable; no extension runtime claim. |
| `VoiceEditScreen.tsx` | fixed VS Code selection/diff, timer processing, “cleanly injected” success | R | Requires selection/context IPC, intent/action approval, actual edit/injection and undo; otherwise show unavailable. |
| `AssistantVoiceScreen.tsx` | local voice selection, timer play, local controls; one no-op checkbox change | F/U | TTS capability is deferred; label all controls unavailable or wire provider/config persistence. |
| `VoiceIdentityScreen.tsx` | local enrollment counters/timers, local history clearing, static export button area | R/U | Voiceprint and retention require backend persistence/permission operations; export/delete must be real or disabled with reason. |
| `StudioSettingsScreen.tsx` | local mic choices/test timer, local hotkey, overlay/injection radios, local startup/tray toggles; disabled language/runtime button | R/U | Route settings/config summary and mutations through IPC/SQLite; startup/tray requires native commands; retain disabled language as explicit U. |
| `SystemDesignScreen.tsx` | design showcase buttons without handlers | F | Legitimate design reference, not a product action. |
| `src/tray/mock-shell.ts` | `MockDaemonTransport` with in-memory status/pause/resume/menu | F | Legitimate CLI/demo fixture; replace with real tray transport before shipping tray. |
| `crates/sori-ipc/src/lib.rs` `MockIpcServer`/`MockTransport` | contract tests; dictation returns explicit error | F | Legitimate unit fixture; never production transport. |
| `crates/sori-cli/src/main.rs` `FakeAudio`, `FakeAsr`, `FakeInjectionAdapter`, `Smoke Dictation` | deterministic fake trigger→history path | F | Legitimate offline contract smoke; name output synthetic and do not use as native E2E. |
| Rust unit fakes in `sorid/runtime.rs`, `sori-core/pipeline.rs`, audio and injection tests | fake capture/provider/target/adapter | F | Legitimate deterministic tests. |
| `tests/desktop-viewport-userflow.test.ts` source assertions | checks labels and unavailable diagnostic text | F | Legitimate source-contract test; extend with truthful action/IPC assertions. |
| `scripts/e2e-desktop-backend.ts` | real sorid/CLI/IPC/SQLite and desktop build | F/test harness | Production-relevant integration smoke, but not dictation. |
| `scripts/e2e-desktop-native.ts` | real Tauri launch, coordinate clicks, screenshot hashes | F/test harness | Shell evidence only; not microphone/hotkey/injection. |
| `scripts/e2e-desktop-ocu.ts` | real Windows app, OCU accessibility navigation and screen labels | F/test harness | Semantic UI evidence only; it intentionally skips unsupported physical voice actions. |
| `tests/` `InMemory*`, HTTP memory repositories | deterministic adapters | F | Legitimate offline tests; not persistence/runtime proof. |
| `apps/desktop/design-reference/**` | duplicate reference UI/data | F | Design reference only; no production route. |

A repository-wide grep used during audit was `grep -RInE 'mock|Mock|fixture|Fixture|sample|Sample|preview|Preview|Simulator|initialData|Fake|fake|setTimeout\(' --exclude-dir=node_modules --exclude-dir=target --exclude-dir=.git .`; it found the paths above plus Firstmate documentation fixtures, which are workflow documentation and outside product behavior.

## 4. Visible UI action inventory and truthful mapping

The following covers the visible navigation, title bar, screens, forms, and diagnostic actions found by `grep -RInE 'onClick=|onChange=|onSubmit=|<button|<input|<select|<textarea' apps/desktop/src/components` and source reads.

| Visible action/group | Current owner/effect | Required real operation or explicit unavailable behavior |
|---|---|---|
| Home/Transcripts/Vocabulary/Voice Edit/Models & Routing/Benchmarks/Extensions/Privacy/Diagnostics/Settings/System Design navigation; sidebar search; mobile open/close | React `activeScreen`; search has no backend effect | Route locally; screen data must be hydrated from corresponding IPC/persistence query. Search must filter real screen data or be marked preview. |
| Start/stop “Preview capture”, Simulate Dictation, prompt chips, clear target textarea, VS Code/Terminal/Slack target selector | Browser Speech API/timeouts/local textarea | `DictationStart` → audio events/chunks → `DictationStop` → `Dictation(model,audio)` → transcript post-process → target detection → `TextInjectionRequest`; until wired, show preview-only and never “inserted”. |
| Pause/resume daemon, tray Pause/Resume | RuntimeClient `pause`/`resume`; real when backend/native connected, mock otherwise | IPC Control + daemon state/event persistence; disable and explain on unavailable/mock. |
| Quick controls open/close; profile buttons; overlay style buttons; navigate Models/Benchmarks/Settings/Diagnostics | Local React state/navigation | Profile/style changes need config mutation + SQLite; navigation itself is local. Current local-only state must be labelled until IPC exists. |
| Desktop/tablet/mobile viewport buttons | `deviceView` + localStorage | Legitimate preview control; acceptance dimensions are 1100-ish desktop, 768px tablet, 375px mobile, with responsive overflow checks. |
| First-Run step buttons, mic select/test, Grant Permissions, injection toggle, Test Hotkey, test field, Finish Setup | Fixed values/timers and optimistic success | Native device-list/permission IPC, actual hotkey registration/test, actual safe target test injection, persistence of onboarding completion. Without them each button must say unavailable/skipped, not success. |
| Transcript view-state test buttons (normal/empty/loading/error), search/app filter, select, copy, delete, close details, reinsert | Local fixture state; copy uses browser clipboard; delete React only; reinsert local callback | Normal screen query `RecentHistory`; filters local over real rows; copy may use clipboard API with permission result; delete must call purge/delete persistence; reinsert must call injection IPC; test-state buttons belong in test/demo mode only. |
| Vocabulary/snippets tabs, CSV paste/cancel/import, add term, category/search filters, delete snippet/term | Local arrays; CSV parsed in browser | Add/import/delete dictionary/snippet IPC + SQLite transaction; validate and report errors. Current local array is preview behavior. |
| Models tabs, cloud/local filter, provider/model selection, install toggle | Local selection and `setModels` | `ConfigSummary`/model manifest/list/install/remove/route operations; cloud requires explicit credentials and privacy policy. Current catalog values are sample data. |
| Benchmark Run/Apply recommended policy | Timer and local route insertion | Backend benchmark command with audio fixture/installed model, persist results, then explicit route mutation; no timer-produced latency claims. |
| Voice edit prompt, example prompts, Apply/Accept & Inject, Undo Last Edit | Timer/fixed diff/optimistic “injected” message | Context/selection capture, intent/action plan, permission approval, actual edit injection, persistence and undo; otherwise disable and show unavailable. |
| Extension Configure/Enable/Disable preview | Local state and explicit preview banner | Extension install/config/permission IPC and sandboxed invocation; until runtime exists, preserve “preview only” language. |
| Spoken voice select/play/speed/policy/check box | Local state and timer | TTS provider capability/config persistence; play requires actual audio output; currently deferred/unavailable. |
| Settings tabs, mic choice/test, hotkey input, overlay style, injection strategy, startup/login, minimize-to-tray | Mostly local state; language select disabled with truthful tooltip | Config read/write IPC/SQLite; native startup/tray/window commands; permission and device checks; leave unavailable controls disabled with prerequisite. |
| Diagnostics Run Doctor, refresh, Test Text Injection, Restart Daemon, Export Diagnostics | Doctor/refresh are real IPC; test/restart explicitly report not wired; export is alert | Doctor maps to `Doctor`; injection must execute a guarded dry-run/real test target; restart needs a supervised daemon command; export must write an actual redacted log or remain disabled. |
| Privacy save-history, retention slider, voice enrollment/reset, guest policy, delete confirmation, export | React state/counters; delete clears current UI session; export has no observed implementation | Settings/history/voice profile IPC + SQLite; purge history/events and confirm durable deletion; export redacted JSON to user-selected path; biometric capability must be explicit unavailable. |
| Overlay error close, “Open Windows Accessibility / Microphone Settings”, overlay styles | Close/style local; alert only | Close is local; style persisted config; OS settings requires Tauri command and result, otherwise unavailable. |
| Native minimize/maximize/close/drag | Current native frame owns controls; custom bar has no window commands or drag region | If replacing frame: Tauri commands for minimize/maximize/close, a non-button drag region, double-click maximize, restore state, and keyboard/accessibility equivalents. See title-bar requirements. |

## 5. Title-bar reference assessment and acceptance criteria

The supplied image was directly inspected at audit time (visual read plus Pillow metadata): **1477 x 192 pixels, RGBA**. The visible window content occupies the upper portion: pale warm Windows chrome/caption from y≈8 through y≈42, a left rail beginning around x=10 and ending at a vertical boundary near x=249, and a large white content field from roughly x=250. Native minimize/maximize/close controls appear in the upper-right around x=1332–1468. The remaining pixels below the visible short reference content are part of the 192px PNG canvas, so `1477x85` was incorrect. This is a Codex-like visual reference, not a pixel-perfect Sori specification; its measured canvas and visible geometry are the starting observations.

Current `DesktopTitleBar.tsx` is a 48px (`min-h-12`) translucent warm React bar with Command Center/runtime badges, preview capture, pause, quick controls, and viewport controls. Its own comment says “Native OS chrome owns close/minimize/maximize.” Therefore it does **not** yet assess or implement a native-frame replacement. Current Tauri config also has no `decorations:false`.

Planned title-bar acceptance criteria:

1. Set native decorations off only in the same change that supplies tested controls; no intermediate build may lose close/minimize/maximize. Keep window title/accessibility name `Sori`.
2. At 100% Windows scaling, measure the reference-like bar height as 44–48 CSS px; content must begin immediately below it, with no duplicate native title strip. At 125% and 150% scaling, preserve physical hit targets of at least 32x32 px and logical bar height within ±2 px after CSS scaling.
3. Preserve warm near-white background, subtle 1px bottom divider, low-contrast border, and the reference’s large clean white content field. No visible default Windows caption buttons or second title bar may remain.
4. Right controls must be contiguous and ordered minimize, maximize/restore, close; each has `aria-label`, tooltip, visible hover/pressed/focus states, and at least 32x32 px hit area. Close has a distinct destructive hover/focus color. Keyboard activation must work.
5. `minimize` calls the Tauri window minimize API and leaves the process/tray state correct; `maximize` toggles and updates label/icon; double-clicking only the drag region toggles maximize; close follows the documented close/minimize-to-tray setting and never silently kills the daemon.
6. Dragging any blank drag-region point moves the window; buttons, inputs, links, sidebar, and content are excluded from drag. Dragging remains usable at 720px minimum width and at tablet/mobile preview widths.
7. At 1100x720, 768px-wide, and 375px-wide viewports, title content does not overlap: collapse nonessential labels before controls, keep menu access reachable, and retain all window controls. Assert no horizontal overflow and no clipped close button.
8. Visual checks must compare screenshots at 100/125/150% Windows scaling and the three app viewport modes. Record image dimensions and a human/vision review of spacing, hierarchy, clipping, and native-frame absence; hashes alone are insufficient.

## 6. Prioritized staged Firstmate worker graph

Workers have disjoint ownership and must not edit each other’s paths. Each card is a separate commit boundary; a worker may only claim its listed files. Rollback is reverting that commit, never discarding unrelated work.

### W0 — Contract and truth baseline (first implementation task)

- **Owner:** IPC contract worker; **paths:** `apps/desktop/src/ipc-contract.ts`, matching Rust IPC tests only. It may not edit `apps/desktop/src/runtime-client.ts`.
- **Dependencies:** none. **Commit:** `feat(ipc): expose truthful dictation and capability contracts`.
- **Acceptance:** TS and Rust representations agree for start/stop/cancel/transcript/history/config/error; no mock result is labelled real; unavailable errors are structured; contract tests cover malformed/unavailable responses.
- **Tests:** `cargo test -p sori-ipc`; `npm run build`; targeted Vitest.
- **Risk/rollback:** protocol mismatch; rollback this commit leaves existing status-only bridge intact.

### W1 — Daemon dictation orchestration

- **Owner:** daemon worker; **paths:** `crates/sorid/**`, `crates/sori-core/src/pipeline.rs` integration tests, no frontend files.
- **Dependencies:** W0 contract review (Rust shape may land first but merge after W0). **Commit:** `feat(daemon): wire dictation requests through pipeline`.
- **Acceptance:** start/stop/cancel state transitions invoke audio, ASR, injection boundary, publish events, and persist history with inserted text or explicit failure; concurrent/paused/no-provider cases fail closed.
- **Tests:** `cargo test -p sorid -p sori-core`; IPC integration test with fakes.
- **Risk/rollback:** hung/partial sessions; retain bounded cancellation and revert orchestration only.

### W2 — Windows hotkey adapter

- **Owner:** hotkey worker; **paths:** `crates/sori-core/src/hotkey.rs` and new Windows adapter/tests, no daemon/frontend ownership. **Dependencies:** W1 lifecycle API. **Commit:** `feat(windows): register daemon hold-to-talk hotkey`.
- **Acceptance:** configured binding registers once, release/cancel stops capture, conflict and shutdown are explicit Doctor/errors, no leaked registration.
- **Tests:** non-Windows fake tests plus Windows integration on a disposable desktop session.
- **Risk/rollback:** global shortcut conflicts; rollback leaves explicit unavailable status.

### W3 — Real CPAL and Whisper readiness gate

- **Owner:** audio/ASR worker; **paths:** `crates/sori-audio/**`, `crates/sori-provider-whisper/**`, setup docs limited to that worker. **Dependencies:** W1. **Commit:** `feat(runtime): harden audio-and-whisper readiness`.
- **Acceptance:** device/model discovery, permission/provider errors, WAV lifetime, cancellation, and model manifest are surfaced through Doctor; no hard-coded installed model claims.
- **Tests:** `cargo test -p sori-audio -p sori-provider-whisper`; real CLI/model test only when prerequisites exist.
- **Risk/rollback:** hardware/model variability; preserve injectable provider and skip semantics.

### W4 — Windows text injection and safe target

- **Owner:** injection worker; **paths:** `crates/sori-core/src/text_injection.rs` and Windows tests. **Dependencies:** W1. **Commit:** `feat(windows): wire guarded text injection`.
- **Acceptance:** direct SendInput into a safe test editor, explicit unsupported/elevated target errors, clipboard fallback only with snapshot/restore, undo status honest.
- **Tests:** fake policy suite always; manual Notepad/target test on Windows only with operator confirmation.
- **Risk/rollback:** focus/UAC/clipboard corruption; kill switch is capability false and rollback this commit.

### W5 — Persistence-backed frontend client

- **Owner:** frontend data worker; **paths:** `apps/desktop/src/App.tsx`, `apps/desktop/src/preferences.ts`, and all of `apps/desktop/src/runtime-client.ts` (including adapters), no Rust core. **Dependencies:** W0–W1; W0 must merge first because it owns the contract, but W5 is the sole owner of `runtime-client.ts`. **Commit:** `feat(desktop): hydrate runtime and persistence data`.
- **Acceptance:** status/doctor/config/history/dictionary/settings use real APIs; localStorage is restricted to cache/viewport; no initial fixture appears as live production data.
- **Tests:** `npm run desktop:check`, Vitest runtime tests, backend E2E.
- **Risk/rollback:** migration/user data; retain explicit empty/loading/unavailable states.

### W6 — Replace per-screen mock actions

- **Owner:** screen worker; paths are only `apps/desktop/src/components/screens/**` plus the non-titlebar component files it is explicitly assigned in a worker manifest. It never edits `DesktopTitleBar.tsx`, title-bar CSS, `runtime-client.ts`, or Tauri files. Split into serialized subcommits by disjoint screen subdirectory if parallel workers are used; no two workers may claim `components/screens/**` concurrently. **Dependencies:** W5. **Commit:** one commit per disjoint screen group.
- **Acceptance:** every action in §4 either invokes an operation and reflects response/error or is disabled and says unavailable; benchmark/edit/extensions/TTS remain deferred rather than simulated.
- **Tests:** desktop checks, component tests, OCU navigation.
- **Risk/rollback:** UX regressions; revert per screen group.

### W7 — Native frame/title bar

- **Owner:** shell/titlebar worker; **sole UI owner of:** `apps/desktop/src/components/DesktopTitleBar.tsx` and title-bar-specific CSS, plus `apps/desktop/src-tauri/tauri.conf.json` and Tauri window-control commands. W6 must not touch these files; W7 must not touch `runtime-client.ts` or screen files. **Dependencies:** W6. **Commit:** `feat(windows): replace native frame with tested titlebar`. If titlebar behavior needs a runtime API, W7 consumes the W0/W5 API via a serialized handoff rather than editing the client.
- **Acceptance:** all §5 geometry and control/drag criteria; no duplicate frame; daemon remains alive on close-to-tray.
- **Tests:** Windows manual controls, native E2E, screenshots/vision at required scales.
- **Risk/rollback:** inaccessible/unclosable window; rollback by restoring decorations and removing custom commands.

### W8 — Truthful end-to-end gate

- **Owner:** verification worker; **paths:** `scripts/**`, `tests/**`, docs for verification only. **Dependencies:** W1–W7. **Commit:** `test(mvp): gate real Windows user flow`.
- **Acceptance:** app launch → real daemon → hotkey hold → mic → Whisper → transcript → focused target insertion → SQLite history/events, with fail-closed prerequisites and evidence artifacts.
- **Tests:** all commands in §7 plus manual checklist.
- **Risk/rollback:** flaky desktop/hardware; separate deterministic suites from gated operator E2E.

## 7. Executable verification plan and skip semantics

### Deterministic baseline (run from repository root)

```sh
cargo fmt --all --check
cargo check --workspace
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
npm run build
npm run test
npm run desktop:check
npm run desktop:build
npm run check
```

Expected baseline from the existing verification report: all Rust tests (audio/core/IPC/persistence/Whisper/sorid), TypeScript build/Vitest, desktop check/build passed. Re-run after every worker; record versions and complete output. `npm --prefix apps/desktop run check` is the direct desktop TypeScript check; `npm --prefix apps/desktop run build` is the direct frontend build.

### Runtime and FE↔BE integration

```sh
npm run e2e:desktop-backend
cargo run -p sori-cli -- status
cargo run -p sori-cli -- doctor
cargo run -p sori-cli -- smoke dictation
```

Backend E2E must prove an isolated database, no stale daemon, real status/doctor/SQLite checks, and desktop build. `smoke dictation` remains a fake adapter smoke and must be labelled synthetic. Add a real IPC dictation test that asserts event order, transcript response, inserted text, and persisted history.

### Windows native/OCU/browser/viewport

On Windows with Cargo, Node/npm, WebView2, Tauri prerequisites, and a logged-in interactive desktop, run the repository’s existing launch flows exactly:

```powershell
npm run e2e:desktop-native
npm run e2e:desktop-ocu
```

`e2e:desktop-native` launches the real Tauri binary and a real `sorid`; `e2e:desktop-ocu` uses the exact underlying command below to inspect WebView2 accessibility and navigate screens. These prove shell/semantic UI only, not microphone, hotkey, Whisper, or injection. Browser Speech success is never production evidence.

**Browser automation command and current prerequisite.** The repository contains `apps/desktop/package.json`’s `webdriverio` dependency, but no browser-E2E spec/config is currently present. Therefore the exact intended command is defined now, but is **SKIPPED** until W8 adds the named file (this is not a pass):

```powershell
npm exec tsx -- scripts/e2e-desktop-browser.ts --base-url http://127.0.0.1:4173 --viewports 1100x720,768x720,375x720 --scales 100,125,150 --out .tmp/e2e-browser
```

W8 must add `scripts/e2e-desktop-browser.ts` using the installed WebdriverIO API, start the built Vite preview (`npm --prefix apps/desktop exec vite preview -- --host 127.0.0.1 --port 4173`), and make that command launch the app/fixture, assert every primary navigation and explicit unavailable state, and save PNG plus accessibility artifacts. Until then, command-level skip evidence is: `Test-Path scripts/e2e-desktop-browser.ts` returns `False` or WebView/driver prerequisites are absent; record the command, result, OS, browser/driver version, and named missing prerequisite. Do not substitute a timer or Web Speech.

**Exact viewport × Windows-scale matrix.** For each of these 9 cells, execute the browser command above (or its W8 implementation) and save a uniquely named screenshot:

```text
scale 100%:  1100x720, 768x720, 375x720
scale 125%:  1100x720, 768x720, 375x720
scale 150%:  1100x720, 768x720, 375x720
```

The viewport is CSS pixels; Windows display scaling must be set in Settings > System > Display before each scale group, then record `Get-CimInstance -ClassName Win32_VideoController | Select-Object Name,CurrentHorizontalResolution,CurrentVerticalResolution` and the active scale shown by `Get-ItemProperty 'HKCU:\Control Panel\Desktop' -Name LogPixels -ErrorAction SilentlyContinue`. At each cell assert no horizontal overflow, reachable navigation, visible titlebar controls, no clipping, and correct drag-region exclusions. If changing display scale would disrupt the operator session, mark that scale `SKIPPED: interactive Windows scaling prerequisite unavailable`, never silently label it pass.

**OCU exact command.** The existing script invokes this command on Windows (with a real app and daemon already launched by the script):

```powershell
npx -y open-computer-use@0.3.1 call --calls-file .tmp/e2e-ocu/nav-home.json
```

The calls file must contain `get_app_state`, `screenshot`, and click/state assertions; the canonical full navigation remains `npm run e2e:desktop-ocu`. If `npx` cannot resolve the package, the OCU service is unavailable, or the accessibility tree is only generic WebView/region nodes, record `SKIPPED` with that exact error and retain failure evidence under `.tmp/e2e-ocu/`; accessibility output cannot replace visual inspection.

### Screenshot and vision review

For every non-skipped matrix cell, capture PNGs with dimensions, source commit, scale, viewport, and environment. The existing native capture is executable but single-environment only:

```powershell
npm run e2e:desktop-native
python -c "from PIL import Image; from pathlib import Path; [print(p, Image.open(p).size, Image.open(p).mode) for p in Path('.tmp/e2e-native').glob('*.png')]"
```

The second command has a concrete prerequisite: `python -c "import PIL"`. If it fails with `ModuleNotFoundError`, record `SKIPPED: Pillow unavailable` (the PNG IHDR can still be checked with a standard-library parser); do not claim dimensions were captured by that command.

The exact OCU screenshot call is `npx -y open-computer-use@0.3.1 call --calls-file <calls-file>`; use it for state/screenshot artifacts, not as a vision verdict. No repository OCU/vision scoring CLI is currently installed or scripted. The required vision prerequisite is therefore explicit: W8 must provide a reviewer-capable command such as `python scripts/vision_review.py --reference "D:\work\navin\Screenshot 2026-08-11 124501.png" --glob ".tmp/e2e-matrix/**/*.png" --report .tmp/e2e-matrix/vision.md`; until that file and its declared model/tool are available, run `Test-Path scripts/vision_review.py`, record `SKIPPED: vision reviewer command absent`, and perform the same checklist manually rather than claiming automated vision.

Review each image against the verified **1477x192 RGBA** reference for warm pale chrome, visible short top frame, left-rail/content boundary near x=249, right control alignment, spacing, and absence of a native duplicate frame. Human/vision review must inspect minimize/maximize/close affordances, focus/hover, clipping, drag-region exclusions, and responsive collapse. SHA-256 uniqueness from `e2e-desktop-native` is only a coarse state-change signal and cannot replace this review.

### Manual Windows capability checklist

1. Start isolated `sorid` with a temporary `SORI_DATABASE_PATH`; run Doctor and record daemon, IPC, SQLite, hotkey, audio, Whisper, injection.
2. Confirm `whisper-cli.exe` and a valid model path; if absent, mark ASR skipped, not passed.
3. Confirm a safe physical input device and microphone permission; if absent, mark CPAL/VAD skipped.
4. Register configured Alt+Space (or configured binding), hold and release once, test conflict, cancellation, and daemon shutdown; record event timestamps.
5. Focus a disposable Notepad/editor window; dictate known text; verify transcript, exact inserted text, newline/Unicode, and no clipboard mutation. Test an elevated target and expect explicit denial.
6. Verify SQLite history/events contain the same transcript, route, active target, insertion result, and errors; reopen app and confirm hydration.
7. Test minimize, maximize/restore, close/close-to-tray, drag and double-click drag-region, keyboard access, and daemon process lifetime.
8. Repeat titlebar screenshots and OCU semantic navigation at all scales/viewports.

**Skip policy:** a check is `SKIPPED` only with a named prerequisite and command/environment evidence (for example, no `whisper-cli.exe`, no model, no safe microphone, non-Windows host, no interactive desktop, or missing WebView2/OCU). A skipped check is never converted to pass by a fake, mock, fixture, browser Speech API, or unit test. Until W1–W4 are integrated, the truthful MVP result remains partial/unavailable.

## 8. First implementation task

Start with **W0: Contract and truth baseline**. Define and test one canonical operation model for status/doctor/config, dictation start/stop/cancel/transcribe, recent history/events, injection result/error, and persistence mutations. Add source-level tests that prevent `MockRuntimeClient`, browser Speech API, timeout-generated transcripts, or fixture success strings from being presented as production capability. Do not remove the deterministic fakes; isolate and label them. The next worker can then implement daemon orchestration against a stable contract without guessing at FE↔BE semantics.

## Final audit boundary

This report is the requested artifact. It records current evidence and planned work only; **Sori is not complete**. It does not claim that native voice, hotkey, Whisper, injection, or the title bar already work or match the reference. This direct report repair modified only `data/sori-mvp-truth-plan/report.md`; it did not mutate source/config/test/doc files and did not delete the pre-existing/untracked `data/sori-runtime-verification/report.md` or workflow-generated `.pi/workflows/*/GUIDE.md` artifacts. The Firstmate runtime generated multiple workflow Guide artifacts while retrying; their presence is explicitly recorded and is not product completion evidence. Final verification commands are:

```powershell
git status --short --untracked-files=all
git diff --stat
git diff --name-only
git diff -- data/sori-mvp-truth-plan/report.md
```

Because the requested report is untracked, ordinary `git diff` may be empty; confirm its content and sole retry write with `Get-Item data/sori-mvp-truth-plan/report.md` and `Get-FileHash data/sori-mvp-truth-plan/report.md -Algorithm SHA256`. The status must still honestly list all observed `.pi` Guides and `data/sori-runtime-verification/report.md`; their presence is not a prohibited source mutation.
