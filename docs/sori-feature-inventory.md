# Sori feature inventory

This document captures the current product scope discussed for Sori/Sov.

## Core direction

Sori is a local-first programmable voice runtime for desktop. The default experience should be extremely simple for non-technical users, while advanced/developer capabilities are progressively disclosed through settings, CLI, profiles, harnesses, models, and extensions.

## Existing major feature groups

- Invisible-first voice input with hold-to-talk.
- Tiny overlay styles: dot, pill, wave, orb, gradient/animation themes.
- Tray quick controls.
- Studio/settings UI with Basic → Advanced → Expert disclosure.
- Rust daemon core with Tauri/React UI clients and Rust CLI.
- Audio Engine: capture, DSP, VAD, noise suppression, resampling, optional AGC/echo cancellation.
- Plug-in ASR/model system: whisper.cpp baseline, sherpa-onnx, Parakeet, PhoWhisper, SenseVoice, ONNX, cloud/BYOK providers.
- Plug-in TTS/custom assistant voice system for spoken LLM/agent replies.
- Model Runtime Manager: warm/cold state, RAM/VRAM, GPU backend, quantization, fallback.
- Auto benchmark and local telemetry for model routing.
- Context Engine before ASR/router: active app, selection, clipboard, project, harness/profile.
- Post-processing: punctuation, capitalization, filler removal, vocabulary correction, formatting.
- Fast Intent Router: deterministic rule engine first, small classifier second, LLM/agent only when needed.
- Text injection and voice editing: paste, replace selection, undo, app-specific insertion strategies.
- Personal Harness Manager: profiles, rules, models, memory, skills, tools, extensions, permissions.
- Owner voice recognition / speaker verification for wake, unlock, and sensitive voice-command gating.
- Event Bus for extension hooks.
- Permission sandbox: dry-run + explicit approval by default for side effects.
- Extension lifecycle: describe → generate → test → sandbox → review diff → approve → install.
- Windows first; macOS second; Linux later with honest Wayland/X11 limitations.

## Newly added scope: 5 product-planning areas

### 1. History UX

Purpose: give users confidence, recoverability, and searchable memory without turning Sori into a surveillance/logging product.

Core behaviors:

- Transcript history is optional and local-first.
- Audio is not persisted by default.
- User can choose retention: off, session-only, 1 day, 7 days, 30 days, forever/manual.
- Search past transcripts, commands, edits, and actions.
- Filter by app, profile, model, language, success/failure, and action type.
- Replay metadata: route chosen, model used, latency, fallback, and insertion target.
- One-click copy previous transcript.
- One-click re-run post-processing with another profile/model.
- Undo/restore where target/app context permits.
- Purge all, purge app-specific history, or purge selected entry.
- Private/sensitive app denylist: never store history from selected apps.

Suggested screens:

- `History` list: chronological transcript/action entries.
- `Entry detail`: transcript, final output, diff, model route, timing, target app, permissions used.
- `Privacy & retention`: retention policy and app denylist.

Important product rule:

> Sori should feel recoverable, not creepy. History must be visibly controllable and off/minimal by default for sensitive contexts.

### 2. Dictionary / Vocabulary UX

Purpose: reduce repeated recognition mistakes for names, project terms, bilingual Vietnamese/English usage, code terms, filenames, crates, commands, and personal writing style.

Core behaviors:

- Personal dictionary for names, phrases, acronyms, product terms, code identifiers, and bilingual terms.
- Project dictionary generated from repo/file names and manually editable.
- App/profile dictionaries: Coding, Email, Chat, Vietnamese, English, Mixed vi-en.
- Correction learning: when user fixes a word repeatedly, Sori suggests adding it.
- Pronunciation hints and aliases.
- Case/style rules: snake_case, camelCase, PascalCase, kebab-case.
- Import/export dictionary as YAML/TOML/JSON for version control.
- Per-term metadata: language, pronunciation, preferred spelling, examples, scope, enabled/disabled.
- Conflict warnings when terms collide.
- Use dictionary before and after ASR:
  - pre-ASR bias/context for model/router where supported;
  - post-processing correction for transcript cleanup.

Suggested screens:

- `Dictionary`: searchable term table.
- `Add term`: word, pronunciation, aliases, language, scope.
- `Suggested terms`: Sori proposes additions from repeated corrections or project scan.
- `Project vocabulary`: repo-aware terms from files, crates, symbols, branch names.

Important product rule:

> Vocabulary is part of the hot path, but editing vocabulary should be simple enough for non-tech users and exportable enough for developers.

### 3. Snippet / Voice Macro System

Purpose: make repeated phrases, commands, and workflows fast without invoking an agent or LLM every time.

Core behaviors:

- Snippets are deterministic and fast.
- Voice trigger → insert text, replace selection, or execute safe local action.
- Examples:
  - “paste my email”
  - “signature work”
  - “standup template”
  - “reply politely”
  - “create bug report template”
  - “open project dashboard”
- Snippets can have variables/placeholders: name, date, project, clipboard, selected text.
- Snippets can be scoped by app/profile/project.
- Snippets can be text-only or action-backed.
- Text-only snippets should not need permission prompts.
- Action snippets with side effects use dry-run + explicit approval.
- Snippet suggestions: Sori detects repeated text/actions and asks whether to create a snippet.
- Import/export snippets as version-controllable config.
- Developer path: snippets can graduate into extensions/workflows.

Suggested screens:

- `Snippets`: searchable list grouped by profile/app/project.
- `Snippet editor`: trigger phrases, output template, variables, scope, preview.
- `Suggested snippets`: repeated workflows Sori noticed.
- `Snippet test`: speak or type a trigger and preview result.

Important product rule:

> Snippets are the fast deterministic layer between raw dictation and full agent automation. They should feel instant and safe.

### 4. Route Editor UI

Purpose: make Sori's model-routing behavior understandable and editable without forcing users to hand-write config files.

Core behaviors:

- Visual routing rules for ASR, LLM cleanup, VAD, TTS, and agent providers.
- Rules can match on language, active app, profile, project, privacy mode, battery state, memory pressure, GPU availability, latency target, and fallback status.
- Rule priority is explicit and reorderable.
- Every route has an explanation: “why this model was selected.”
- Dry-run route testing: user provides a scenario and Sori shows selected model/provider without recording audio.
- Benchmark results can generate suggested rules.
- Safe defaults for non-tech users: Auto, Local-first, High accuracy, Low latency, Cloud allowed, Never cloud.
- Expert mode can export/import route config as TOML/YAML.

Suggested screens:

- `Routing overview`: current policy cards.
- `Rule builder`: if condition → use provider/model → fallback.
- `Route simulator`: test language/app/profile/hardware scenario.
- `Generated recommendations`: accept/edit suggestions from benchmark.

Example rules:

```text
If language = Vietnamese → prefer PhoWhisper → fallback whisper.cpp small q5.
If app = VS Code and language = English → prefer Parakeet warm → fallback whisper.cpp.
If privacy = strict → local providers only.
If battery = low → quantized small model.
If local model fails and cloud allowed → OpenAI-compatible ASR.
```

Important product rule:

> The route editor should expose power without making normal users feel responsible for model selection. “Auto” must remain good enough.

### 5. First MVP exact scope

Purpose: prevent scope creep and define what the first build must prove.

MVP thesis:

> Prove that Sori can be a fast, reliable, local-first Windows voice runtime that captures speech, transcribes locally, post-processes deterministically, and inserts text into the active app with a tiny overlay.

In scope for MVP:

- Windows first.
- Rust daemon `sorid`.
- Local IPC.
- Basic CLI for start/stop/status/doctor.
- Tray app or minimal Tauri shell.
- Hold-to-talk hotkey.
- Audio capture → DSP basics → VAD.
- `whisper.cpp` provider as first ASR plugin, not hard-coded architecture.
- Minimal Model Runtime Manager: installed model, load/warm state, fallback error.
- Tiny overlay with at least Dot and Pill styles.
- Text insertion via clipboard/paste fallback plus undo/restore attempt.
- Basic post-processing: punctuation/capitalization/filler cleanup.
- Basic context: active app name + selected profile.
- History MVP: session entries + copy previous + purge all + retention off/session.
- Dictionary MVP: manual personal terms + simple correction replacement.
- Snippet MVP: text-only snippets with trigger phrase.
- Benchmark MVP: local benchmark for installed model with latency/RTF/RAM where available.
- Permission MVP: clear microphone/injection status and side-effect dry-run pattern, even if extension actions are not yet built.
- Settings IA: General, Voice, Overlay, History, Dictionary, Snippets, Models, Permissions, Advanced.

Out of scope for MVP:

- macOS/Linux production support.
- Generated extensions.
- Extension marketplace.
- Full agent workflows.
- Meeting/system audio.
- Cloud provider marketplace.
- Complex memory system.
- Multi-user/team sync.
- Heavy dashboard analytics.
- Wayland support guarantees.

MVP success criteria:

- Install → permission → first successful dictation in under 60 seconds.
- p95 hotkey release to inserted text is acceptable on the captain's Windows machine.
- Works in at least: browser text field, VS Code/editor, chat app, terminal fallback.
- Clear failure state when insertion is blocked.
- User can recover/copy previous output.
- User can add one dictionary term and one snippet.
- Benchmark can recommend or validate the default local model.

Important product rule:

> If MVP cannot make the hot path feel native-fast and reliable, do not expand into agent/extension features yet.

### 6. Owner Voice Recognition / Speaker Verification

Purpose: let Sori distinguish the owner/captain from other speakers for privacy, safety, and personalized behavior.

Core behaviors:

- Optional owner voice enrollment during setup or later in settings.
- Voice profile stored locally by default.
- Use speaker verification for:
  - accepting wake/command phrases only from the owner;
  - gating sensitive actions;
  - choosing the correct personal harness/profile;
  - rejecting or ignoring guest/unknown voices;
  - marking transcript entries by speaker when enabled.
- Modes:
  - Off: no speaker verification.
  - Soft verify: warn/ask confirmation when voice is unknown.
  - Strict owner-only: ignore commands from non-owner voices.
  - Guest dictation: allow dictation but block commands/actions.
- Enrollment UX should be short: read 3–5 sample phrases, then test.
- Recovery path: PIN/password/OS auth if owner voice check fails.
- Local-first biometric/privacy posture: never upload voiceprint unless user explicitly chooses a cloud provider.
- Clear delete/re-enroll controls.

Suggested screens:

- `Voice Identity`: enrollment status, confidence threshold, owner-only mode.
- `Enroll voice`: phrase recording and test.
- `Guest policy`: what unknown speakers can do.
- `Voice identity events`: local audit of accepted/rejected sensitive commands.

Important product rule:

> Voice identity is a safety/privacy layer, not a perfect authentication replacement. Sensitive side effects still need dry-run + explicit approval unless the user deliberately changes policy.

### 7. Custom Assistant Voice / TTS Reply

Purpose: when the user talks with an LLM/agent, Sori can answer back with a chosen synthetic voice instead of only text.

Core behaviors:

- Optional spoken replies for conversational/agent mode.
- TTS provider system is plug-and-play like ASR/LLM:
  - local TTS;
  - cloud TTS;
  - custom OpenAI-compatible or provider-specific endpoint;
  - future voice-clone/custom voice provider if legally/ethically permitted.
- Voice library:
  - choose voice;
  - preview sample;
  - set speed, pitch, tone, volume;
  - choose language/accent;
  - per-profile assistant voice.
- Reply mode policy:
  - Never speak;
  - Speak only in conversation mode;
  - Speak short confirmations;
  - Speak full answers;
  - Headphones-only / quiet hours.
- Transcript + audio response history follows History UX retention rules.
- Safety/privacy:
  - do not clone a third-party voice without explicit rights;
  - show provider data flow;
  - allow local-only TTS profile;
  - mute on sensitive apps or when screen sharing is detected if possible.

Suggested screens:

- `Assistant Voice`: choose TTS provider and voice.
- `Voice preview`: play sample and tune speed/pitch/tone.
- `Reply policy`: when Sori should speak.
- `Provider data flow`: local/cloud/BYOK status.

Important product rule:

> Spoken replies are for agent/conversation mode, not the hot dictation path. They must never add latency to normal hold-to-talk paste.

## Cross-check against IDEA.md and USP.md

Current coverage looks complete for the intended product direction:

- Universal voice-input runtime, not Whisper GUI: covered by daemon/core/client split and runtime positioning.
- CLI, tray, mini overlay, full UI: covered.
- Rust core, Tauri optional GUI, IPC, SQLite, config: covered.
- Audio capture/DSP/VAD/noise suppression: covered.
- Pluggable ASR models and cloud adapters: covered.
- Model Router and auto benchmark: covered.
- Context engine, developer mode, voice commands, voice editing: covered.
- Dictionary, snippets, modes/profiles, personalization: covered.
- Text injection across Windows/macOS/Linux: covered at scope level, with Windows-first MVP.
- Personal Voice Harness: covered.
- Skills/Tools/Extensions separation: covered.
- Self-generating extensions / `Sori build`: covered as post-MVP/future scope.
- Plug-and-play provider types beyond ASR: ASR, LLM, VAD, TTS, Agent are now covered.
- CLI commands such as models/extensions/skills/harness/permissions/doctor: covered via CLI/runtime scope.
- Safety/permission sandbox: covered.
- Newly requested owner voice recognition and custom TTS assistant voice: added.

Potential remaining details to decide later:

- Exact TTS providers/local models for first implementation.
- Whether speaker verification is MVP, beta, or post-MVP.
- Whether guest dictation is allowed by default.
- Legal/consent policy for custom/clone voices.

## Updated information architecture

```text
Sori
├── General
├── Voice
│   ├── Microphone
│   ├── Voice Identity
│   └── Assistant Voice
├── Overlay
├── History
├── Dictionary
├── Snippets
├── Models
│   ├── Installed
│   ├── Available
│   ├── Providers
│   └── Benchmark
├── Profiles
├── Extensions
├── Permissions
└── Advanced
    ├── Runtime
    ├── Diagnostics
    ├── Logs
    └── Developer
```

## MVP treatment for the 5 added areas

- History MVP: local session history + copy previous + purge all + retention setting.
- Dictionary MVP: manual terms + project terms import + correction suggestion stub.
- Snippets MVP: text snippets with trigger phrases + app/profile scope + preview.
- Route Editor MVP: read-only “why this model was selected” plus simple Auto/Local-first/Cloud-allowed presets.
- Voice Identity MVP decision: optional post-MVP unless captain wants strict owner-only as a launch requirement; implement UI placeholder and privacy policy early.
- Assistant Voice/TTS MVP decision: post-MVP for full spoken LLM replies; implement provider abstraction in architecture so it can plug in later.
- Exact MVP Scope: Windows hot path first; defer generated extensions, marketplace, macOS/Linux production support, full agent workflows, full TTS voice library, and production-grade speaker verification.

Do not block the hot path on these systems. They improve quality and speed, but basic hold-to-talk dictation must work without setup.
