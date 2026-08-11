# Sori PRD — Local-first programmable voice runtime

## Status

Sori is an early Windows-first desktop MVP. The current repository contains a Rust daemon (`sorid`), loopback IPC, SQLite persistence, and a React/Tauri desktop shell. The end-to-end voice path is not complete yet: native hotkey capture, microphone capture, Whisper execution, and text injection remain scaffold/future work. See the [MVP capability matrix](docs/mvp-capability-matrix.md).

Repository: <https://github.com/kyoo-147/Sori>

## Product thesis

Sori is a **local-first programmable voice runtime** for desktop.

The default user experience should be simple enough for non-technical users:

```text
Install → grant permissions → hold hotkey → speak → text appears in the active app
```

Power-user and developer capabilities should be progressively disclosed through settings, CLI, model routing, profiles, harnesses, skills, tools, extensions, and permission policies.

Sori should not be positioned as “a Whisper GUI” or merely “AI voice typing.” The long-term framing is:

> Sori — your programmable voice runtime.

## Core UX principles

- **90% invisible:** most usage happens without opening a window.
- **8% overlay/tray:** small dot, pill, wave, or orb UI appears only while listening, previewing, or asking for attention.
- **2% Studio/CLI:** settings, diagnostics, models, extensions, and harnesses are opened only when needed.
- **Basic → Advanced → Expert:** do not split normal/developer modes too rigidly; reveal depth progressively.
- **Hot path stays fast:** normal dictation must not require LLMs, agents, or extensions.
- **Local-first privacy:** audio is not persisted by default; history and telemetry are local and controllable.
- **Side effects are gated:** shell/network/filesystem/deploy actions use dry-run + explicit approval by default.

## Target platforms

Priority:

1. Windows first.
2. macOS second.
3. Linux later, with honest X11/Wayland limitations.

## High-level architecture

Current implementation truth:

```text
React/Tauri shell → loopback IPC bridge → sorid (Rust) → SQLite
                                      ↘ lifecycle/diagnostic contracts
```

The boundaries for audio, hotkey, ASR, and injection exist, but their real platform adapters are not yet wired into a working dictation path. The larger pipeline below is the product direction, not a claim about current implementation.


```text
CLI / Tray / Overlay / Full UI
          │
         IPC
          ↓
      Sori daemon
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

Implementation direction:

- Core daemon: Rust (`sorid`).
- UI: Tauri + React as optional client.
- CLI: Rust + `clap`.
- IPC: Windows named pipe; Unix socket on macOS/Linux.
- Metadata: SQLite.
- Config: TOML/YAML/JSON for advanced users.
- Secrets: OS keychain.

## User journeys

### First-run journey

Goal: first successful dictation in under 60 seconds.

```text
Install
→ microphone permission
→ accessibility/input permission
→ press hotkey
→ speak
→ text appears
→ benchmark runs later in background
```

Do not force model selection during onboarding.

### Daily user journey

```text
Hold hotkey
→ tiny overlay appears
→ speak
→ release
→ text is inserted into focused app
```

If there is selected text, Sori switches to voice edit/replace. If a terminal is focused, Sori may enter command mode. If an action has side effects, Sori shows dry-run + approval.

### Power-user/developer journey

```text
Open Studio or CLI
→ enable Advanced/Expert
→ configure models/routes/profiles/harness/extensions
→ use same runtime from overlay, tray, CLI, or headless mode
```

## UI / frontend scope

### Overlay

Overlay styles:

- dot;
- pill;
- wave;
- orb/ball;
- gradient/animated variants;
- minimal monochrome.

Default overlay should be tiny:

```text
● listening
```

or:

```text
● Coding · Local
```

Overlay expands only for:

- errors;
- permission requests;
- transcript preview;
- edit diff;
- agent action;
- model fallback warning.

### Tray

Tray is quick control only:

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

### Studio / settings

Studio should feel like Raycast settings, VS Code settings, Linear, or a native system utility — not a SaaS analytics dashboard.

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

## Functional requirements

### Audio Engine

- Microphone capture.
- Device selection.
- DSP pipeline:
  - resample;
  - channel mix;
  - noise suppression;
  - optional AGC;
  - optional echo cancellation.
- VAD.
- Pre-roll and stop-tail.
- Local telemetry for latency and failure states.

### ASR and model system

Do not hard-code the app around Whisper. `whisper.cpp` is the first baseline provider, but the architecture must be provider/plugin based.

Local candidates:

- whisper.cpp;
- sherpa-onnx;
- Parakeet;
- PhoWhisper;
- SenseVoice;
- ONNX models;
- custom local providers.

Cloud/BYOK candidates:

- OpenAI;
- Groq;
- Google;
- Deepgram;
- AssemblyAI;
- Azure;
- ElevenLabs;
- OpenRouter-compatible endpoint;
- custom OpenAI-compatible endpoint.

Provider categories should eventually include:

- ASR Provider;
- LLM Provider;
- Embedding Provider;
- TTS Provider;
- VAD Provider;
- Agent Provider.

### Model Runtime Manager

Owns:

- install/load/unload state;
- warm/cold status;
- RAM/VRAM;
- GPU backend;
- quantization;
- fallback chain;
- memory pressure handling;
- model cache.

### Model Router and Route Editor

Router inputs:

- language;
- active app;
- selected profile;
- project context;
- hardware/GPU;
- battery/performance mode;
- privacy mode;
- benchmark result;
- warm/cold state.

Route Editor must support readable rules such as:

```text
vi → PhoWhisper
en + CUDA → Parakeet
battery → Whisper Q5
fallback → cloud if allowed
```

Presets:

- Performance;
- Balanced;
- Battery;
- Privacy;
- Auto;
- Local-first;
- Cloud allowed;
- Never cloud.

### Auto Benchmark

Auto benchmark is a product feature, not just diagnostics.

Measure:

- latency;
- p50/p95;
- RAM/VRAM;
- WER/CER;
- RTF;
- cold/warm start;
- model load time;
- fallback failures;
- insertion latency by app.

Output:

- human recommendation;
- router policy suggestion;
- local telemetry only by default.

### Context Engine

Context participates before ASR/model routing and after transcript generation.

Sources:

- active app;
- window title;
- selection;
- clipboard;
- project/repository;
- terminal/git state;
- current profile;
- user harness;
- dictionary;
- snippets;
- app mode.

Uses:

- choose model/profile;
- bias vocabulary;
- format output;
- detect dictation/edit/command;
- protect sensitive apps.

### Post-processing

Features:

- punctuation;
- capitalization;
- filler removal;
- vocabulary correction;
- formatting;
- style cleanup;
- optional LLM cleanup;
- diff/reason when meaning may change.

### Fast Intent Router

Order:

1. Rule engine.
2. Deterministic command grammar.
3. Dictation/edit detection.
4. Small classifier if needed.
5. LLM/agent router only when needed.

### Voice commands and editing

Examples:

- new line;
- undo;
- delete last sentence;
- select previous word;
- paste my email;
- signature work;
- git status;
- cargo run release → `cargo run --release`;
- snake case user account id → `user_account_id`.

Voice edit behavior:

- no selection → dictation;
- selection → edit/replace;
- terminal → command mode;
- side effect → approval.

### Text injection

Strategies:

- clipboard + paste fallback;
- Windows Win32/SendInput/UI Automation where possible;
- macOS Accessibility API;
- Linux X11/Wayland strategies later.

Must support:

- insert text;
- replace selection;
- restore clipboard where possible;
- undo where possible;
- clear blocked-state errors.

### History

History should stay lightweight by default:

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
- retention: off, session-only, Recent 20, 1 day, 7 days, 30 days, manual/forever;
- advanced search/filter;
- retry with another model;
- add correction to dictionary;
- purge all/selected;
- sensitive app denylist.

### Personal Dictionary / Vocabulary

First-class Studio screen.

Features:

- names of people;
- project terms;
- Rust crate names;
- file names;
- acronyms;
- Vietnamese/English mixed terms;
- pronunciation aliases;
- correction learning;
- suggested terms;
- case rules: snake_case, camelCase, PascalCase, kebab-case;
- import/export.

### Snippets / Voice Macros

Deterministic fast layer between dictation and full agent automation.

Features:

- trigger phrase;
- insert text;
- replace selection;
- variables/placeholders;
- app/profile/project scope;
- text-only snippets without permission prompt;
- action snippets with dry-run + approval;
- suggestions from repeated workflows;
- import/export.

### Personal Harness

Each user can have a personal voice harness:

```text
harness/
├── identity.md
├── instructions.md
├── models.toml
├── permissions.toml
├── memory/
├── skills/
├── extensions/
└── workflows/
```

Harness contains:

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

### Skills / Tools / Extensions

Keep these layers separate:

| Layer | Purpose |
|---|---|
| Skill | instructions / knowledge |
| Tool | primitive function/API |
| Extension | packaged capability |
| Harness | full operating profile |

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

Future feature:

```text
Sori build "an extension that controls Spotify"
```

### Event Bus

Events for telemetry and extension hooks:

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

### Permissions and safety

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

### Voice Identity / Speaker Verification

Optional feature, later than MVP unless reprioritized.

Correct behavior:

```text
Dictation → always allowed by default
Sensitive command → voice verify
Destructive action → voice verify + explicit approval
```

Modes:

- Off;
- Soft verify;
- Strict owner-only for commands/actions only;
- Guest dictation, block commands/actions.

Voiceprint is a signal for command gating, not a replacement for approval.

### Assistant Voice / TTS Reply

Optional feature for LLM/agent conversation mode, not normal dictation.

Features:

- local TTS;
- cloud/BYOK TTS;
- custom endpoint;
- future custom/clone voice with explicit consent;
- voice preview;
- speed/pitch/tone/volume;
- per-profile assistant voice;
- reply policies:
  - never speak;
  - conversation mode only;
  - short confirmations;
  - full answers;
  - quiet hours/headphones-only.

## CLI

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

## MVP plan

### Current MVP foundation

- Rust daemon and lifecycle control.
- Loopback IPC and SQLite event persistence.
- React/Tauri desktop shell with diagnostics.
- Contracts/scaffolds for Windows hotkey, audio/VAD, `whisper.cpp`, and text injection.

The foundation is implemented; the real hotkey → microphone → Whisper → injection path is still integration work.

### V0.2

- Parakeet / sherpa.
- Model Manager.
- Benchmark/router.
- Context.
- Voice edit.

### V0.3

- Harness.
- Extensions.
- Agent.
- Permissions.

### Later

- Voice Identity.
- TTS.
- Generated extensions.
- macOS/Linux production support.

## V0.1 success criteria

- Install → permission → first dictation under 60 seconds.
- Works in browser text field, VS Code/editor, chat app, terminal fallback.
- Acceptable p95 latency on the captain’s Windows machine.
- Clear failure when insertion is blocked.
- Recover/copy previous output.
- Add one dictionary term.
- Add one snippet.
- Model abstraction exists even though `whisper.cpp` is first.

## Current repository

The Rust workspace and `apps/desktop` are the active Sori runtime path. The older TypeScript/Fastify API under `src/` is a separate prototype and is not the desktop product backend. The desktop UI may use mock/HTTP fallback outside the native shell; that fallback is not evidence that voice capture or insertion works.

Existing scripts:

```sh
npm install
npm run dev
npm run build
npm test
npm run check
```

## Workflow policy

Current development workflow:

- public GitHub repository;
- direct PR workflow;
- no No Mistakes gate yet;
- PRs may be reviewed and merged by the agent when they are acceptable;
- stricter approval and No Mistakes guardrails should be added after MVP shape is proven.
