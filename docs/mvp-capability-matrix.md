# MVP capability matrix

This matrix distinguishes implemented repository boundaries and runtime wiring from physical Windows acceptance. `Implemented` means the deterministic contracts, platform adapter, and/or daemon runtime path exists and is covered by tests; it does not claim that a real microphone, speech model, global key, or focused target has been exercised on a Windows machine.

| Capability | Status | Current truth |
|---|---|---|
| Rust daemon (`sorid`) | Implemented | Starts, owns lifecycle state, and exposes diagnostics/control contracts. |
| Loopback IPC | Implemented | The daemon and Tauri bridge exchange canonical local IPC requests; transport is local-only. |
| SQLite persistence | Implemented | `sorid` opens/migrates SQLite and persists lifecycle events/recent events. |
| React/Tauri desktop shell | Implemented | `apps/desktop` builds a native shell and prefers the Tauri IPC bridge, with browser fallbacks. |
| Diagnostics/status UI | Implemented | The shell can display real daemon/IPC/SQLite diagnostics when connected. |
| Hotkey capture | Implemented (runtime path) | Win32 registration, WM_HOTKEY handling, hold/release state, conflict handling, recovery, and daemon service wiring are implemented and contract-tested. Physical global-hotkey delivery and microphone-permission behavior remain `UNVERIFIED`. |
| Microphone/audio capture | Implemented (runtime path) | CPAL device discovery, F32/I16/U16 conversion, mono/chunk handling, VAD events, cancellation, and restart-safe lifecycle are implemented and tested with deterministic fakes. Physical device start, permissions, and real speech remain `UNVERIFIED`. |
| Whisper ASR | Implemented (configured external path) | The provider discovers a user-supplied whisper.cpp executable/model, writes temporary WAV input, runs/parses output, reports prerequisite/process failures, and cleans up; deterministic fake-runner tests cover the contract. A real executable/model and real speech transcript remain `UNVERIFIED`. |
| Text injection | Implemented (runtime adapter) | Windows SendInput planning/execution, target validation, focused-target identity checks, and truthful failure outcomes are implemented and contract-tested. Physical insertion into a focused app, permission/elevation behavior, and clipboard fallback remain `UNVERIFIED`; the native adapter currently advertises direct input only. |
| End-to-end dictation | Implemented (contract/runtime path) | The daemon path connects hotkey → capture/VAD → Whisper provider → text injection → SQLite/events/frontend boundaries. A controlled physical Windows run with microphone permissions, real speech, global hotkey, focused-app insertion, and persisted transcript is still `UNVERIFIED`. |
| Tray lifecycle and permissions | Implemented (runtime boundaries); physical acceptance `UNVERIFIED` | Lifecycle/permission diagnostics and recovery boundaries exist; installed tray behavior and OS permission prompts require Windows acceptance. |
| Installer, packaging, and signing | Future/deferred | Production installer/package/signing delivery is not claimed by the repository runtime path and still requires release work and machine validation. |
| Routing, benchmark, voice edit, extensions, TTS | Future/deferred | Product direction only; not MVP-complete. |

## Evidence boundary

Deterministic tests, fake devices/runners/targets, browser or mock UI, and configured-provider contract checks prove software boundaries only. They must not be read as proof of physical Windows microphone permissions, real speech recognition, global hotkey delivery, focused-app insertion, installer behavior, or signing. Those acceptance items remain explicitly `UNVERIFIED` until observed on the target machine.
