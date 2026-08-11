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
