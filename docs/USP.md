### Core concept

```
Voice
 ↓
Sori Runtime
 ↓
Personal Voice Harness
 ├─ ASR model
 ├─ LLM / Agent
 ├─ Context
 ├─ Tools
 ├─ Skills
 ├─ Extensions
 ├─ Rules
 └─ Memory
 ↓
Action
```

Tức là mỗi user có một **voice harness riêng**.

Ví dụ:

```
name: michael

asr:
  model: parakeet

agent:
  model: gpt-5.6

context:
  - clipboard
  - terminal
  - git
  - active_app

extensions:
  - coding
  - browser
  - github
  - shell

rules:
  - prefer_rust
  - concise_responses
```

## Điểm hay nhất: extension tự sinh

Đây mới là feature tôi nghĩ có thể làm Sori khác biệt.

User nói:

> "Sori, tạo cho tôi extension để khi tôi nói deploy project thì nó build Docker rồi deploy server."

Sori:

```
Voice
 ↓
Agent understands requirement
 ↓
Generate extension
 ↓
Write code
 ↓
Test
 ↓
Ask permission
 ↓
Install
 ↓
Available immediately
```

Sau đó:

```
Sori extensions

docker-deploy
github-pr
project-status
open-workspace
meeting-notes
```

Nó gần như:

> **Voice-controlled programmable computer + agent harness.**

---

## Extension architecture

Tôi sẽ cho extension rất đơn giản:

```
~/.Sori/extensions/
    github/
        extension.toml
        SKILL.md
        src/

    deploy/
        extension.toml
        SKILL.md
        src/
```

Manifest:

```
name = "deploy"
description = "Build and deploy projects"

[permissions]
shell = true
network = true
docker = true
```

Có thể viết bằng:

- Rust
- Python
- TypeScript
- shell
- MCP
- HTTP API

---

## Quan trọng hơn nữa: Extension ≠ Skill

Tách thành 4 lớp:

|Layer|Công dụng|
|---|---|
|**Skill**|hướng dẫn agent cách làm|
|**Tool**|primitive function/API|
|**Extension**|package chức năng hoàn chỉnh|
|**Harness**|cách toàn bộ agent hoạt động|

Ví dụ:

```
Sori
 ├── Skill: "How to deploy safely"
 ├── Tool: docker.run()
 ├── Extension: Docker Deployment
 └── Harness: Michael Developer Assistant
```

Đây là abstraction rất mạnh.

---

# Model cũng phải plug-and-play

```
Sori models add openai
Sori models add ollama
Sori models add anthropic
Sori models add groq
Sori models add ./my-model-provider
```

Không chỉ ASR.

Tách:

```
ASR Provider
LLM Provider
Embedding Provider
TTS Provider
VAD Provider
Agent Provider
```

Ví dụ:

```
Sori use asr parakeet
Sori use llm codex
Sori use tts kokoro
```

Hoặc:

```
Sori profile coding
```

→ tự load toàn bộ stack dành cho coding.

---

# CLI nên giống shell/runtime hơn

Không cần:

```
Sori listen
```

Default:

```
Sori
```

→ mở interactive voice session.

Ví dụ:

```
Sori › listening...

You:
check this repo and fix the failing tests

Sori:
repository detected: ./agent-runtime
working...
```

Commands:

```
Sori
Sori run
Sori ask
Sori models
Sori extensions
Sori skills
Sori harness
Sori permissions
Sori doctor
```

---

# Một idea rất mạnh: `Sori build`

User:

```
Sori build "an extension that controls Spotify"
```

Agent tự:

```
Research API
   ↓
Generate extension
   ↓
Generate manifest
   ↓
Generate tests
   ↓
Run sandbox
   ↓
Install
```

Hoặc nói trực tiếp:

> "Sori, từ giờ mỗi khi tôi nói focus mode thì mở VS Code, đóng Chrome và bật playlist coding."

Sori nhận ra đây là workflow lặp lại:

```
Create extension?
> yes
```

Vậy sản phẩm **tự phát triển theo người dùng**.

---

# Personal Harness

Đây có thể là USP lớn nhất.

```
Sori harness create michael
```

Sinh:

```
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

Harness học dần:

```
Michael
├── coding style
├── preferred models
├── vocabulary
├── projects
├── commands
├── workflows
└── frequently used tools
```

Hai người cài Sori sau vài tháng sẽ có **hai Sori hoàn toàn khác nhau**.

---

## Tôi sẽ định vị như thế này

Không:

> AI voice typing.

Không:

> Whisper desktop.

Mà:

> **Sori — Your programmable voice runtime.**

Hoặc mạnh hơn:

> **Sori — Build your computer around your voice.**

Kiến trúc:

```
                Sori
                 │
           Voice Runtime
                 │
        Personal Harness
                 │
 ┌───────────────┼────────────────┐
 Models        Skills          Extensions
   │              │                │
 ASR/LLM       Knowledge       Executable
   │              │                │
 └───────────────┼────────────────┘
                 │
              Agent
                 │
        Computer / APIs
```

Hướng này **đáng làm hơn rất nhiều** so với cạnh tranh trực diện với Wispr Flow/OpenWhispr. Voice transcription chỉ trở thành **input layer** của một programmable agent runtime.