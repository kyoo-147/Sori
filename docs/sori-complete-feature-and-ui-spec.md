# Sori complete feature and UI specification

## 1. Product direction

Sori is a **local-first programmable voice runtime** for desktop.

The product should feel simple for normal users:

- install;
- grant permissions;
- hold hotkey;
- speak;
- text appears in the active app.

Power-user and developer capabilities should be progressively disclosed through:

- advanced settings;
- CLI;
- models;
- route editor;
- profiles/harnesses;
- skills/tools/extensions;
- event hooks;
- permission sandbox.

Positioning:

- Not “a Whisper GUI”.
- Not only “AI voice typing”.
- Better framing: **Sori — your programmable voice runtime**.

## 2. Primary UX principles

- **Invisible-first:** 90% of the time the user should not see Sori.
- **Tiny overlay:** 8% of the time the user sees dot/pill/wave/orb status.
- **Studio/CLI only when needed:** 2% of the time the user opens configuration or developer tools.
- **Basic → Advanced → Expert:** do not split “normal mode” and “developer mode” too rigidly.
- **Hot path must stay fast:** LLMs, agents, and extensions must not be mandatory for normal dictation.
- **Local-first privacy:** do not persist audio by default; history and telemetry are controllable.
- **Side effects are gated:** dry-run + explicit approval by default for shell/network/filesystem/deploy actions.

## 3. Supported platforms

Initial priority:

1. Windows first.
2. macOS second.
3. Linux later, with honest X11/Wayland limitations.

Target app type:

- desktop app;
- background daemon;
- tray client;
- optional full UI;
- CLI/headless mode.

## 4. Core architecture

### 4.1 Runtime

- Rust user-session daemon: `sorid`.
- Local IPC:
  - Windows named pipe;
  - Unix socket on macOS/Linux.
- Tauri + React optional UI.
- Rust CLI using `clap`.
- SQLite for metadata.
- TOML/YAML/JSON config for advanced users.
- OS keychain for secrets.

### 4.2 High-level pipeline

```text
CLI / Tray / Overlay / Full UI
          │
         IPC
          ↓
      Sori Daemon
          │
 ┌────────┴─────────┐
 │                  │
Context          Audio Engine
 │          capture → DSP → VAD
 │                  │
 └──────→ ASR Router
              │
       Runtime Manager
              │
    Local / Cloud Providers
              │
       Raw Transcript
              │
       Post-processing
              │
       Fast Intent Router
       /      |       \
 Dictation   Edit   Command
                  \
                   Agent Router
                       │
                  Harness
               Skills / Tools
                 Extensions
                       │
            Permission Sandbox
                       │
                    Action
                       │
                Active App

        ↕ Event Bus toàn hệ thống
```

## 5. Audio Engine

### 5.1 Capture

- Microphone capture.
- Device selection.
- Hot-unplug handling.
- Bluetooth latency handling.
- Microphone permission state.

### 5.2 DSP pipeline

Separate from capture:

- resampling;
- channel mixing;
- noise suppression;
- optional AGC;
- optional echo cancellation;
- pre-roll;
- stop-tail.

### 5.3 VAD

- Voice activity detection.
- Speech started/stopped events.
- Configurable sensitivity.
- Support for future VAD providers.

## 6. ASR / Model system

### 6.1 Principle

Do not hard-code the app around Whisper.

`whisper.cpp` can be the first baseline provider, but the architecture must support plug-in ASR providers from the beginning.

### 6.2 ASR providers

Local providers:

- whisper.cpp;
- sherpa-onnx;
- NVIDIA Parakeet;
- PhoWhisper;
- SenseVoice;
- faster-whisper optional;
- ONNX models;
- custom provider plugins.

Cloud providers:

- OpenAI;
- Groq;
- Google;
- Deepgram;
- AssemblyAI;
- Azure;
- ElevenLabs;
- OpenRouter-compatible endpoint;
- custom OpenAI-compatible endpoint.

### 6.3 Provider categories

The provider system should cover more than ASR:

- ASR Provider;
- LLM Provider;
- Embedding Provider;
- TTS Provider;
- VAD Provider;
- Agent Provider.

## 7. Model Runtime Manager

The ASR Router should not call models directly.

Runtime Manager owns:

- is model installed?
- is model loaded?
- warm/cold start;
- RAM/VRAM usage;
- GPU backend;
- quantization;
- model fallback;
- local failure → cloud fallback if allowed;
- unload under memory pressure;
- model cache.

Example decisions:

- Parakeet is warm → use it.
- VRAM is low → use Whisper quantized.
- Vietnamese profile → prefer PhoWhisper.
- Strict privacy → local-only.
- Local fails and cloud is allowed → cloud ASR fallback.

## 8. Model Router

Router inputs:

- language;
- active app;
- selected profile;
- project context;
- hardware;
- RAM/VRAM;
- GPU availability;
- battery state;
- latency target;
- privacy policy;
- benchmark results;
- model warm/cold state.

Router outputs:

- selected ASR model;
- selected post-processing model;
- fallback chain;
- explanation: “why this route was selected”.

## 9. Auto Benchmark

Auto benchmark is a core feature, not just diagnostics.

It should measure:

- latency;
- p50/p95;
- RAM;
- VRAM;
- WER/CER;
- RTF;
- cold start;
- warm start;
- failure/fallback rate;
- model load time;
- insertion latency by app.

Benchmark output:

- human-readable recommendation;
- JSON/config output for router;
- recommended route policy.

Example:

```text
Speed       → Parakeet
Balanced    → Whisper Small Q5
Vietnamese  → PhoWhisper
Low memory  → Whisper Tiny/Base quantized
Accuracy    → Whisper Large / cloud provider
```

## 10. Context Engine

Context should not only run after ASR. It should also influence routing before ASR.

Context sources:

- active app;
- window title;
- selected text;
- clipboard;
- project/repository;
- terminal/git state;
- current profile;
- user harness;
- dictionary;
- snippets;
- app mode.

Uses:

- choose ASR/model;
- bias vocabulary;
- choose profile;
- detect dictation vs edit vs command;
- format output;
- select post-processing rules;
- protect sensitive apps.

Examples:

- VS Code + Rust repo → coding vocabulary, crate/file names.
- Slack → casual style.
- Gmail → email formatting.
- Terminal → command mode.
- ChatGPT/Codex → prompt mode.

## 11. Post-processing

Post-processing can be deterministic or model-assisted.

Features:

- punctuation;
- capitalization;
- filler removal;
- vocabulary correction;
- formatting;
- style cleanup;
- app-specific formatting;
- profile-specific formatting;
- optional LLM cleanup;
- diff/reason when changing meaning-sensitive text.

Important rule:

- Post-processing should not alter meaning silently.

## 12. Fast Intent Router

Intent should not be a single LLM classifier.

Order:

1. Rule engine.
2. Deterministic command grammar.
3. Dictation/edit detection.
4. Small intent classifier if needed.
5. LLM/agent router only when needed.

Intent paths:

- Dictation.
- Voice edit.
- Deterministic command.
- Snippet/macro.
- Agent task.
- Extension action.

## 13. Voice commands

Examples:

- new line;
- undo;
- delete last sentence;
- select previous word;
- paste my email;
- signature work;
- open project;
- git status;
- cargo run release → `cargo run --release`;
- snake case user account id → `user_account_id`;
- camel case current user → `currentUser`.

Rule:

- Simple commands should be deterministic and fast.
- Do not invoke LLM unless necessary.

## 14. Voice editing

One hotkey, multiple behaviors:

- no selection → dictation;
- selection exists → edit/replace selection;
- terminal focused → command mode;
- sensitive action → approval flow.

Features:

- selected text rewrite;
- replace selection;
- undo;
- preview diff;
- accept/reject;
- app-aware behavior.

## 15. Text injection

Supported strategies:

- clipboard + paste fallback;
- Windows Win32/SendInput/UI Automation where possible;
- macOS Accessibility API;
- Linux X11/Wayland strategies.

Features:

- insert text;
- replace selection;
- restore clipboard where possible;
- undo where possible;
- clear error when blocked;
- target capability detection.

## 16. Overlay / frontend interaction

Overlay styles:

- dot;
- pill;
- wave;
- orb/ball;
- gradient;
- minimal monochrome;
- animated waveform.

Overlay customization:

- color;
- gradient;
- opacity;
- size;
- position;
- animation style;
- expand behavior;
- theme preset.

Default overlay:

```text
● listening
```

or:

```text
● Coding · Local
```

Overlay expands only for:

- error;
- permission request;
- agent action;
- transcript preview;
- edit diff;
- model fallback warning.

## 17. Tray UI

Tray is a quick control surface.

Items:

- ready/listening status;
- current profile;
- overlay style;
- model route;
- language;
- local/cloud status;
- pause Sori;
- open settings;
- open models;
- open benchmark;
- quit.

## 18. Full UI / Studio information architecture

Studio should feel like:

- Raycast settings;
- VS Code settings;
- Linear-like utility;
- native system utility.

It should not feel like a SaaS dashboard.

Information architecture:

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

Progressive levels:

- Basic: hotkey, overlay, microphone, language, privacy defaults.
- Advanced: models, providers, benchmark, dictionary, profiles.
- Expert: runtime, event bus hooks, extension SDK, logs, CLI, harness files.

## 19. Onboarding

Target: under 60 seconds.

Flow:

```text
Install
→ microphone permission
→ accessibility/input permission
→ press hotkey
→ speak
→ text appears
→ benchmark runs later in background
```

Do not force users to choose models during onboarding.

## 20. Model Manager UI

Critical screen for multi-model runtime.

Sections:

- Installed;
- Available;
- Providers;
- Benchmark.

Model details:

- name;
- installed/not installed;
- language;
- disk size;
- RAM/VRAM;
- backend;
- latency;
- accuracy;
- license;
- recommended use case;
- warm/cold status;
- install/uninstall;
- benchmark;
- details.

Example models:

- Parakeet;
- Whisper Small Q5;
- PhoWhisper;
- SenseVoice;
- Whisper Large V3.

## 21. Route Editor UI

Purpose:

- make routing understandable and editable.
- provide a deeper rule editor beyond Model Manager and Benchmark.

Features:

- visual routing rules;
- rule priority;
- route simulator;
- benchmark-generated recommendations;
- explicit fallback chain editor;
- presets:
  - Auto;
  - Performance;
  - Balanced;
  - Battery;
  - Privacy;
  - Local-first;
  - High accuracy;
  - Low latency;
  - Cloud allowed;
  - Never cloud.

Rule examples:

```text
vi → PhoWhisper
English + CUDA → Parakeet
Battery mode → Whisper Q5
Fallback → cloud provider if allowed
If language = Vietnamese → prefer PhoWhisper → fallback whisper.cpp small q5.
If app = VS Code and language = English → prefer Parakeet warm → fallback whisper.cpp.
If privacy = strict → local providers only.
If battery = low → quantized small model.
If local model fails and cloud allowed → OpenAI-compatible ASR.
```

## 22. History UX

Purpose:

- lightweight recoverability;
- searchable past outputs when enabled;
- transparent local telemetry;
- not surveillance and not a large transcript manager by default.

Default UX:

```text
Recent 20
Undo
Copy
Retry with another model
Add correction
```

Features:

- optional transcript history;
- audio not persisted by default;
- lightweight recent list by default;
- retention policy:
  - off;
  - session-only;
  - Recent 20;
  - 1 day;
  - 7 days;
  - 30 days;
  - forever/manual;
- search history in Advanced mode;
- filter by app/profile/model/language/action/success/failure in Advanced mode;
- copy previous transcript;
- undo when possible;
- retry with another model;
- add correction to dictionary;
- re-run post-processing;
- view model route and latency;
- purge all;
- purge selected;
- app denylist for sensitive apps.

## 23. Personal Dictionary / Vocabulary UX

This needs a clear first-class screen in Studio, not only a background feature.

Features:

- personal dictionary;
- project dictionary;
- app/profile dictionary;
- Vietnamese/English mixed terms;
- names of people;
- project terms;
- Rust crate names;
- acronyms;
- code identifiers;
- file/project terms;
- snippet-related terms;
- pronunciation hints;
- aliases;
- correction learning;
- suggested terms from repeated corrections;
- case/style rules:
  - snake_case;
  - camelCase;
  - PascalCase;
  - kebab-case;
- import/export YAML/TOML/JSON;
- conflict warnings.

Uses:

- pre-ASR bias where supported;
- post-processing correction;
- context-aware formatting.

## 24. Snippet / Voice Macro system

Purpose:

- deterministic fast automation between dictation and full agent workflows.

Features:

- trigger phrase;
- insert text;
- replace selection;
- variables/placeholders;
- app/profile/project scope;
- suggestions from repeated workflows;
- text-only snippets require no permission prompt;
- action-backed snippets require dry-run + approval;
- import/export config;
- snippets can later graduate into extensions.

Examples:

- paste my email;
- signature work;
- standup template;
- reply politely;
- create bug report template;
- open project dashboard.

## 25. Personal Harness Manager

Each user can have a personal voice harness.

Harness includes:

- identity;
- instructions;
- models;
- permissions;
- memory;
- skills;
- tools;
- extensions;
- workflows;
- vocabulary;
- rules;
- projects;
- command preferences;
- writing style.

Example layout:

```text
michael/
├── identity.md
├── instructions.md
├── models.toml
├── permissions.toml
├── memory/
├── skills/
├── extensions/
└── workflows/
```

## 26. Skills / Tools / Extensions

Separate four layers:

| Layer | Purpose |
|---|---|
| Skill | instructions / knowledge for agent |
| Tool | primitive function/API |
| Extension | packaged capability |
| Harness | complete agent operating profile |

Extension structure:

```text
~/.Sori/extensions/
  github/
    extension.toml
    SKILL.md
    src/
```

Extension languages/integration types:

- Rust;
- Python;
- TypeScript;
- shell;
- MCP;
- HTTP API.

Extension lifecycle:

```text
describe
→ generate
→ write code
→ generate manifest
→ generate tests
→ run sandbox
→ review diff
→ approve permissions
→ install
```

Future `Sori build`:

```text
Sori build "an extension that controls Spotify"
```

## 27. Event Bus

Global event bus for extension hooks and telemetry.

Events:

- `audio.started`;
- `vad.speech_started`;
- `asr.selected`;
- `transcript.partial`;
- `transcript.final`;
- `intent.detected`;
- `action.before`;
- `action.after`;
- `permission.requested`;
- `model.fallback`;
- `extension.invoked`;
- `tts.started`;
- `tts.finished`;
- `speaker.verified`;
- `speaker.rejected`.

## 28. Safety / permission sandbox

Default policy:

- dry-run + explicit approval for side effects.

Sensitive permissions:

- shell;
- network;
- docker;
- filesystem read/write;
- clipboard;
- active app;
- selection;
- microphone;
- text injection;
- GitHub/API actions;
- deploy actions.

Approval options:

- deny;
- allow once;
- remember policy for this extension/project;
- always require approval.

Security features:

- audit log;
- action receipt;
- undo where possible;
- risk-based confirmation;
- prompt injection defense;
- OS keychain for secrets;
- local-only default where possible.

## 29. Owner Voice Recognition / Speaker Verification

New requested feature.

Purpose:

- identify the owner/captain voice;
- restrict sensitive commands;
- support guest behavior;
- choose correct harness/profile.

Important UX correction:

```text
Dictation → always allowed by default
Sensitive command → voice verify
Destructive action → voice verify + explicit approval
```

Do not apply strict owner-only verification to ordinary dictation by default.

Features:

- optional enrollment;
- local voice profile by default;
- read 3–5 sample phrases;
- confidence threshold;
- delete/re-enroll;
- recovery via PIN/password/OS auth;
- voice identity event log.

Modes:

- Off;
- Soft verify: warn/confirm unknown voice;
- Strict owner-only: ignore commands from non-owner;
- Guest dictation: allow dictation, block commands/actions.

Use cases:

- accept wake/command phrases only from owner;
- gate sensitive actions;
- prevent guest from triggering shell/deploy actions;
- select personal harness;
- speaker tagging in history if enabled.

Important rule:

- Voice identity is not a replacement for side-effect approval.
- Voiceprint is a signal for command gating, not a sufficient authorization mechanism.

## 30. Custom Assistant Voice / TTS Reply

New requested feature.

Purpose:

- when user talks with LLM/agent, Sori can answer with a chosen machine voice.

Features:

- optional spoken replies;
- TTS provider system;
- local TTS;
- cloud TTS;
- BYOK provider;
- custom endpoint;
- future voice clone/custom voice provider with consent;
- voice preview;
- speed/pitch/tone/volume;
- language/accent;
- per-profile assistant voice.

Reply policies:

- never speak;
- speak only in conversation mode;
- speak short confirmations;
- speak full answers;
- headphones-only;
- quiet hours.

Privacy/safety:

- no voice cloning without rights/consent;
- show provider data flow;
- local-only option;
- mute in sensitive apps or during screen share if possible;
- spoken replies must not slow normal dictation.

## 31. CLI

CLI should feel like a runtime shell.

Commands:

```text
sori
sori run
sori ask
sori models
sori benchmark
sori extensions
sori skills
sori harness
sori permissions
sori doctor
sori history
sori snippets
sori dictionary
```

Examples:

```text
sori --model parakeet
sori --model whisper-small
sori --lang vi
sori --translate en
sori file.mp3
sori | codex
```

## 32. Local telemetry / diagnostics

Features:

- latency per stage;
- RAM/VRAM;
- model cold start;
- RTF;
- fallback logs;
- permission failures;
- injection failures;
- local-only by default;
- no external telemetry unless explicitly enabled.

Screens:

- Diagnostics;
- Logs;
- Benchmark;
- Route explanation;
- Doctor.

## 33. MVP exact scope

MVP thesis:

> Prove Sori can be a fast, reliable, local-first Windows voice runtime that captures speech, transcribes locally, post-processes deterministically, and inserts text into the active app with a tiny overlay.

Version cut:

```text
V0.1
✓ Rust daemon
✓ Windows
✓ Hotkey
✓ Audio/VAD
✓ whisper.cpp
✓ Text injection
✓ Dot overlay
✓ Tray
✓ Model abstraction

V0.2
✓ Parakeet / sherpa
✓ Model Manager
✓ Benchmark/router
✓ Context
✓ Voice edit

V0.3
✓ Harness
✓ Extensions
✓ Agent
✓ Permissions

Later
✓ Voice Identity
✓ TTS
✓ Generated extensions
```

V0.1 in scope:

- Windows first;
- Rust daemon;
- local IPC;
- basic CLI;
- tray/minimal Tauri shell;
- hold-to-talk;
- Audio Engine basics;
- VAD;
- `whisper.cpp` provider as first ASR plugin;
- model abstraction from the start;
- minimal Model Runtime Manager;
- Dot overlay;
- clipboard/paste insertion fallback;
- undo/restore attempt;
- basic punctuation/capitalization/filler cleanup;
- basic active app context;
- lightweight Recent 20/session history;
- manual dictionary term;
- text snippet trigger;
- local benchmark stub if cheap, otherwise V0.2;
- permission status and dry-run pattern.

V0.1 out of scope:

- production macOS/Linux support;
- Parakeet/sherpa production support;
- full Model Manager;
- full Benchmark/router UI;
- full Context Engine;
- Voice edit production UX;
- generated extensions;
- extension marketplace;
- full agent workflows;
- meeting/system audio;
- complex memory;
- multi-user sync;
- production-grade speaker verification;
- full TTS voice library;
- cloud provider marketplace.

MVP success criteria:

- install → permission → first dictation under 60 seconds;
- works in browser field, VS Code/editor, chat app, terminal fallback;
- acceptable p95 latency on captain’s Windows machine;
- clear failure when insertion is blocked;
- recover/copy previous output;
- add one dictionary term;
- add one snippet;
- benchmark validates default local model.

## 34. Completeness check against IDEA.md and USP.md

Covered:

- Universal voice runtime.
- CLI / Tray / Mini Overlay / Full UI.
- Rust core.
- Audio pipeline.
- Pluggable ASR/model system.
- Model Router.
- Auto benchmark.
- Context engine.
- Developer mode.
- Voice commands.
- Voice editing.
- Personalization.
- Dictionary/snippets/modes/router config.
- Rust daemon + Tauri GUI.
- IPC.
- SQLite.
- Cross-platform injection plan.
- Personal Voice Harness.
- Skills / Tools / Extensions / Harness separation.
- Self-generating extensions as future feature.
- Plug-and-play providers beyond ASR.
- CLI runtime commands.
- Permission sandbox.
- Owner voice recognition.
- Custom assistant TTS voice.

Remaining decisions:

- Which TTS provider/local voice model first?
- Is owner voice verification MVP, beta, or post-MVP?
- Is guest dictation enabled by default?
- What legal/consent policy for custom voices?
- Which exact Windows apps define the MVP insertion test matrix?
