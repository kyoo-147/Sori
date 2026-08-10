# Backend parallel implementation plan

This plan splits backend work so multiple workers can proceed without blocking each other.

## Track A — Runtime contracts and daemon skeleton

Status: started.

Owns:

- Rust workspace.
- `sori-core` domain contracts.
- `sorid` daemon scaffold.
- `sori` CLI scaffold.
- CI validation for Rust.

Next:

- Add typed IPC request/response schema.
- Add daemon state machine.
- Add lifecycle events.

## Track B — Windows hotkey and overlay trigger

Owns:

- Register hold-to-talk hotkey.
- Emit `audio.started` / `audio.cancelled` style events.
- Decide fallback when hotkey conflicts.

Blocked by captain? No.

Needs manual test later:

- Windows hotkey permissions/conflicts.

## Track C — Audio Engine

Owns:

- CPAL capture adapter.
- DSP placeholder pipeline.
- VAD adapter trait and first stub.
- Audio device doctor checks.

Blocked by captain? Not for code scaffold.

Needs manual test later:

- Microphone permission and real device capture.

## Track D — Text injection

Owns:

- Clipboard/paste fallback.
- Undo/clipboard restore attempt.
- Target capability reporting.
- Windows insertion doctor checks.

Blocked by captain? Not for code scaffold.

Needs manual test later:

- Real app matrix: browser, VS Code, chat app, terminal.

## Track E — Model abstraction and whisper.cpp provider

Owns:

- Provider plugin boundary.
- Installed model metadata.
- Runtime status.
- First `whisper.cpp` command/FFI strategy decision.

Blocked by captain? No, unless a specific model binary/source is chosen.

## Track F — Persistence

Owns:

- SQLite schema for settings/history/models/events.
- Retention policies.
- Recent 20 history.

Blocked by captain? No.

## Track G — Tray/Tauri client

Owns:

- Minimal tray shell.
- Dot overlay proof.
- Settings entry point.

Blocked by designer? Partially. Backend can expose API while UI design proceeds.

## Track H — Route/benchmark scaffolding

Owns:

- Benchmark result data model.
- Route preset model: Performance, Balanced, Battery, Privacy.
- Route explanation object.

Blocked by captain? No.

## Current captain-required items

None for repository/backend scaffolding.

Later manual actions:

- Approve Windows microphone permission during real capture testing.
- Approve input/accessibility permission if Windows prompts.
- Choose first local model download policy when `whisper.cpp` provider is implemented.
- Provide BYOK/cloud API keys only when cloud fallback begins.
