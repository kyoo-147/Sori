# MVP capability matrix

This matrix distinguishes shipped repository boundaries from working product behavior. A scaffold is testable code or UI that does not yet complete the user path.

| Capability | Status | Current truth |
|---|---|---|
| Rust daemon (`sorid`) | Implemented | Starts, owns lifecycle state, and exposes diagnostics/control contracts. |
| Loopback IPC | Implemented | The daemon and Tauri bridge exchange canonical local IPC requests; transport is local-only. |
| SQLite persistence | Implemented | `sorid` opens/migrates SQLite and persists lifecycle events/recent events. |
| React/Tauri desktop shell | Implemented | `apps/desktop` builds a native shell and prefers the Tauri IPC bridge, with browser fallbacks. |
| Diagnostics/status UI | Implemented | The shell can display real daemon/IPC/SQLite diagnostics when connected. |
| Hotkey capture | Scaffold | Rust state/contracts and UI affordances exist; native hold-to-talk registration is not wired to the daemon path. |
| Microphone/audio capture | Scaffold | Audio contracts/configuration exist; real platform capture and VAD are not complete. |
| Whisper ASR | Scaffold | Provider boundary and Whisper command strategy exist; no packaged/executing Whisper path is complete. |
| Text injection | Scaffold | Injection planning/contracts and UI states exist; end-to-end insertion into the focused app is not complete. |
| End-to-end dictation | Future/deferred | Hotkey → microphone → Whisper → injection must be integrated and manually validated. |
| Tray packaging, permissions, signing | Future/deferred | Shell direction exists; production packaging and platform permission flow remain. |
| Routing, benchmark, voice edit, extensions, TTS | Future/deferred | Product direction only; not MVP-complete. |

## Reading rule

Screens, mock data, contracts, and unit tests may describe the intended experience. They must not be read as proof that the real hotkey/mic/Whisper/injection path works.
