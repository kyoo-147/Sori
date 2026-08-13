# Native Windows voice E2E evidence — 2026-08-13

## Result

**PARTIAL / DO NOT CLAIM DICTATION SUCCESS.** The real Whisper executable and model are available and transcribe the primary `jfk.wav` fixture. The real Sori daemon and Tauri desktop shell launch, and Doctor reports Whisper ready. A real `DictationStart` request did not return within 10 seconds and all subsequent IPC requests timed out while `sorid` remained alive. No physical speech, ASR from microphone audio, focused-target insertion, or transcript SQLite history was observed.

## Environment and exact paths

- Worktree: `C:/Users/hoang/.treehouse/Sori-85ff33/7/Sori`
- Branch: `fm/hardware-e2e-1786601800`
- Whisper executable: `D:/work/Sori/.tmp/whisper/bin/Release/whisper-cli.exe`
- Whisper model directory: `D:/work/Sori/.tmp/whisper/models`
- Model: `ggml-base.en.bin`
- Fixture: `D:/work/Sori/.tmp/whisper/jfk.wav`
- SQLite attempt database: `.tmp/hardware-e2e-1786601800/voice-primary.db`

## Timestamped stages

All timestamps below are from the captured logs. Sori/Whisper log timestamps are UTC; shell timestamps include `+07:00`.

| Stage | Timestamp | Evidence | Result |
|---|---|---|---|
| Backend build/Doctor without Whisper paths | `2026-08-13T13:29:18+07:00`–`13:29:28+07:00` | `.tmp/hardware-e2e-1786601800/backend.log` | Real daemon/SQLite/CPAL/hotkey checks ran; Doctor failed only because Whisper executable was not configured. |
| Native desktop launch | `2026-08-13T13:29:34+07:00`–`13:31:37+07:00` | `.tmp/hardware-e2e-1786601800/native.log`; `.tmp/e2e-native-shell/visual-review-manifest.json` | Real Tauri executable launched against real `sorid`; native shell geometry checks passed; 4 PNGs captured with visual review pending. |
| Primary Whisper fixture smoke | `2026-08-13T13:35:26+07:00`–`13:35:27+07:00` | `.tmp/hardware-e2e-1786601800/fixture.log`; `jfk.txt` | **VERIFIED fixture-only ASR**: exit 0, total `1570.68 ms`, transcript `And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.` No microphone audio was used. |
| Windows audio device inspection | `2026-08-13T06:35:32.8274441Z` | `.tmp/hardware-e2e-1786601800/devices.log` | Windows enumerated `Jack Mic (Realtek(R) Audio)` as `AudioEndpoint` status `OK`; Intel Smart Sound digital microphones, Realtek Audio, and NVIDIA HDMI devices also reported status `OK`. This is enumeration evidence only, not CPAL capture proof or permission proof. |
| Doctor with primary Whisper paths | `2026-08-13T06:34:04.677Z` | `.tmp/hardware-e2e-1786601800/voice-primary.log` | Real daemon response: `whisper: ok (whisper.cpp executable and model are ready)`; `audio: ok (CPAL adapter configured; permission and device are verified when a session starts)`; hotkey and direct SendInput checks are capability declarations, not physical proof. |
| Real DictationStart | `2026-08-13T06:34:04.679Z` request | `.tmp/hardware-e2e-1786601800/voice-primary.log` | **Timed out at 10 seconds** with `AbortError: This operation was aborted`; no accepted-start response or `AudioStarted` event was returned. |
| Post-start status/stop/history | `2026-08-13T06:34:17.698Z`–`06:34:47.729Z` | `.tmp/hardware-e2e-1786601800/voice-primary.log` | Status, DictationStop, RecentEvents, and RecentHistory all timed out while the daemon process remained alive. No transcript/history evidence was produced. |
| Notepad focused-target attempt | `2026-08-13T06:36:37.5959710Z`–`06:36:38.4432686Z` | `.tmp/hardware-e2e-1786601800/notepad-attempt.log` | Notepad launched (`pid=61624`) and a synthetic Alt+Space was sent. No Sori acceptance, speech, transcript, or insertion was observed; this is not native physical-hotkey proof. VS Code was not installed/discoverable as `code.exe`. |

## Truth boundary

- **VERIFIED:** real `sorid` launch, loopback IPC before capture, SQLite migration/open, real Tauri desktop launch, native shell screenshots/geometry, primary whisper.cpp executable/model readiness, and fixture-only Whisper transcription.
- **ENUMERATED, NOT VERIFIED:** Windows audio endpoints include `Jack Mic (Realtek(R) Audio)` with status `OK`.
- **UNVERIFIED:** CPAL opening/playing the physical input stream, microphone permission, physical speech, VAD speech events, global physical Alt+Space, ASR over microphone capture, focused Notepad/VS Code SendInput, SQLite transcript history, and FE dictation success.
- **Likely code-level root cause:** `crates/sorid/src/main.rs:221-227,233-235` holds the shared runtime mutex and executes `runtime.start_audio()` inline in the IPC request handler. `crates/sorid/src/runtime.rs:94-113` delegates synchronously to the audio engine, while `crates/sori-audio/src/lib.rs:167-179` performs CPAL default-device and default-input-config discovery before `stream.play()` at lines 200-212. The timeout therefore identifies the capture boundary as the blocking stage, but does not prove whether the underlying Windows call is device enumeration, permission negotiation, stream construction, or `play()`. Because the runtime mutex remains held, subsequent Status/Stop/Events/History requests also timed out. A fix would require backend async/worker lifecycle changes, which is outside this evidence-only task; no fix is claimed.

No fake transcript, fake input, browser preview, or screenshot was used as voice success evidence.
