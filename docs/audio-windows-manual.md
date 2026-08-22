# Windows microphone manual check

The daemon now exposes the real CPAL input lifecycle through loopback IPC, but CI
and unit tests do not require hardware.

1. Open **Settings > Privacy & security > Microphone**.
2. Enable **Microphone access** and **Let desktop apps access your microphone**.
3. Connect or enable an input device and make it the Windows default input.
4. Start `sorid`, then run `sori doctor`; the audio check must say the CPAL
   adapter is configured.
5. Call the loopback IPC `DictationStart`, speak, then call `DictationStop`.
   Inspect `RecentEvents` for `AudioStarted`, bounded chunk events, VAD
   transitions, and `AudioStopped`.
6. Test cancellation with `DictationStart` followed by `DictationCancel`.

A failed start is reported as an error and does not claim transcript or text
insertion success. Record the exact device, Windows permission state, and
error text when reporting a manual failure.

## Physical hotkey acceptance artifact

Run `scripts/windows-hotkey-injection-acceptance.ps1` with a real `sorid`/Sori
executable and review the JSON artifact after the manual action. The harness
never sends the configured hotkey or synthesizes microphone input. It snapshots
`RecentHistory` and `RecentEvents` before the action, then requires a new
history row whose `transcript.text` and `inserted_text` match the observed (or
explicitly expected) text. It also records and requires
`AudioStarted`, `AudioChunkCaptured`, `VadSpeechStarted`, `VadSpeechEnded`,
`TranscriptFinal`, and `AudioStopped` from the post-action event journal.

No user action, missing hardware/provider, empty target readback, missing
history, or incomplete event chain remains a voice success: the artifact is
`UNVERIFIED` (while setup/IPC/ownership failures are `BLOCKED`).

## Wave 3 one-shot physical acceptance

Use `scripts/windows-wave3-final-acceptance.ps1` on the installed Windows
build. Supply the installed desktop executable and an already-installed model:

```powershell
npm run e2e:windows-wave3-acceptance -- -InstalledAppExecutable 'C:\Program Files\Sori\sori.exe' -Model 'ggml-base.en.bin' -Hotkey 'Alt+Space' -ExpectedText 'known sentence'
```

The script preflights the installed app/daemon ownership lease and requires
green Doctor capability checks for text injection, audio, hotkey, and Whisper.
It records the persisted permissions/onboarding resources when available;
their default empty permissions array is not treated as a synthetic failure.
It also validates `AudioReadiness` and the real model catalog. It creates
one harness-owned Win32 EDIT target, records its HWND/PID, and stops for the
captain to focus that target, press the configured hotkey, speak one known
sentence, and release. It never synthesizes focus, keys, audio, or clipboard
input. The JSON artifact requires a new SQLite history row, matching transcript
and inserted text, route-level HWND/PID evidence, visible EDIT readback, and
daemon restart persistence. The endpoint must be free before launch; only
processes correlated to this invocation's lease/PID/start-time are stopped.
Restart requires a new listener, daemon PID, and lease generation. Expected
text is compared literally after only CRLF normalization and trimming.
Missing physical evidence is `BLOCKED` or `PARTIAL`, never a synthetic
success; the Tauri webview refresh is recorded as unverified when it cannot
be observed safely.

## Wave 4 local Whisper/SAPI probe

Run `npm run probe:windows-whisper` on the Windows captain machine. The probe
only inspects already-owned `whisper-cli.exe`/`main.exe`, a non-empty local
`*.bin` model, and the locally generated SAPI corpus. It never downloads or
copies assets and its committed-safe JSON artifact contains no private paths.

When all prerequisites and daemon IPC are available, each corpus fixture is
sent through the canonical `sori benchmark` command and reports provider,
latency, RTF, WER, and CER. Otherwise it exits with
`BLOCKED_PREREQUISITES` and lists the exact environment/configuration or
captain action required. A blocked or partial result is not readiness evidence.

Generate the corpus only when needed, then verify it before rerunning:

```powershell
./scripts/windows-audio-fixture-corpus.ps1
./scripts/windows-audio-fixture-corpus-verify.ps1
```

The probe does not synthesize microphone, keyboard, focus, or insertion input;
those remain covered only by the user-operated physical acceptance gate.
