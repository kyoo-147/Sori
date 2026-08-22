# Audio capture, DSP, and VAD

The audio engine boundary lives in `sori-core::audio`. It deliberately does not
expose CPAL types: device discovery and capture are represented by
`AudioDeviceProvider` and `AudioEngine`, while `CaptureConfig` describes the
requested format and chunk size.

## Deterministic local speech corpus

Build a legal, machine-local corpus from an already installed Windows SAPI voice:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-audio-fixture-corpus.ps1 -OutputDirectory .\data\audio-corpus
```

The script writes mono 16 kHz PCM WAV files plus `manifest.json` containing the
expected transcript, selected voice/culture, variant (silence/pause, speed, or
volume), generation provenance, and SHA-256. It never downloads assets, opens a
microphone, or claims physical-device evidence. `-IncludeVietnamese` adds a
Vietnamese sentence only when the selected installed SAPI voice has a `vi-*`
culture; otherwise it explicitly skips that case.

Generation invokes the strict verifier before returning. To re-check an
existing corpus without regenerating audio, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-audio-fixture-corpus-verify.ps1 -CorpusDirectory .\data\audio-corpus
```

Verification checks installed-voice provenance, expected transcript metadata,
SHA-256 bytes, mono PCM16/16 kHz WAV structure, and rejects unlisted files.

## Current scope

- `AudioDeviceInfo` and `AudioDeviceProvider` describe input-device listing.
- `CaptureConfig` defaults to mono 16 kHz `f32` audio in 20 ms chunks.
- `AudioDsp` receives mono callback frames and linearly resamples each stream to
  the configured 16 kHz target while retaining phase and boundary samples.
- `EnergyVad` uses RMS energy with a configurable end hangover; the legacy
  `EnergyVadStub` remains available only for compatibility tests.
- `VoiceActivityDetector` is the VAD boundary. `EnergyVadStub` is deterministic
  test scaffolding, not a production detector.

The `sori-audio` crate contains the CPAL adapter. It translates native device
and stream errors to `AudioError` and keeps CPAL types out of `sori-core`.
`CpalAudioEngine::start` selects the configured device (or the OS default),
starts a callback-backed bounded channel, applies the validated input gain,
and `stop` drops the stream.
`CpalAudioController` owns the CPAL stream on a worker thread and exposes an
explicit callback-quiesce phase: teardown marks the callback inactive, pauses
the native stream, then drops the stream and joins the worker. The worker drains
packets already accepted by the bounded callback handoff after quiescing,
including a final partial chunk, before it reports the capture stopped. Dropping
the controller performs the same shutdown, preventing orphaned native streams.

`crates/sori-audio/tests/native_harness.rs` is an opt-in capture/diagnostic and
start/stop/restart harness. It requires `SORI_NATIVE_AUDIO_HARNESS=1` and
`--ignored`; it reports post-DSP device, sample-count, peak, RMS, rate, and
channel diagnostics. Set `SORI_NATIVE_AUDIO_TRANSCRIBE=1` with a user-owned
`SORI_WHISPER_CPP_BIN`, `SORI_WHISPER_MODEL_DIR`, and optional
`SORI_WHISPER_MODEL` to exercise the real Whisper handoff. Low signal is
reported as `capture_signal_unavailable`; blank Whisper markers are rejected as
non-transcripts rather than accepted as success.

It exposes an `Idle -> Starting -> Recording -> Stopping` lifecycle. Each
successful capture has a monotonically increasing generation/session ID; stop and cancel are
idempotent. The callback uses `try_send`, so a slow consumer drops packets
rather than blocking the audio thread; packets accepted before stop are not
discarded during teardown. Native stream disconnects are surfaced
as `DeviceUnavailable` rather than a fabricated success.

`next_chunk` drains the channel into a mono 16 kHz VAD-ready `f32` shape.
The controller uses an unbounded per-session handoff queue and drains it after
stop, removing the old 64-chunk truncation and small-queue loss during long
recordings without blocking the CPAL callback. The core contracts and adapter
conversion tests are hardware-independent. No microphone is opened during
`cargo test`.

Physical microphone, permission, hot-plug, and Windows CPAL readiness remain
**UNVERIFIED** in automated validation; the manual checks below require a real
machine and microphone.

## Manual microphone testing plan

1. On Windows, open **Settings → Privacy & security → Microphone** and enable
   **Microphone access** and **Let desktop apps access your microphone** for the
   terminal/daemon host. Restart Sori after changing this setting.
2. Enumerate input devices and confirm the expected default device name and id.
3. Start capture with the default `CaptureConfig`; verify the selected device,
   native sample rate, channel count, and chunk duration in diagnostics.
4. Speak, pause, and speak again. Confirm the VAD sequence is
   `SpeechStarted`, `SpeechContinues`, `SpeechEnded` and that silence does not
   create transcript work.
5. Test a non-default input device and unplug it during capture; report a clear
   `DeviceUnavailable` error and ensure the daemon remains usable.
6. Repeat on Windows and Linux with Bluetooth and USB microphones, including a
   device whose native rate differs from 16 kHz. Confirm delivered chunks are
   mono 16 kHz output.
7. Confirm that raw audio is not persisted by default and that stopping capture
   releases the device.

## Open-source references and licenses

- CPAL device and stream lifecycle patterns are adapted from
  [RustAudio/cpal](https://github.com/RustAudio/cpal), Apache-2.0 licensed.
  Its documentation explicitly treats input/output as low-level I/O and
  recommends application-level processing above the stream boundary.
- The need to resample native microphone rates before Whisper follows the
  discussion in [CPAL issue #753](https://github.com/RustAudio/cpal/issues/753);
  Sori uses its own small linear stage rather than introducing a competing
  capture pipeline or copying third-party code.

## Windows playback/loopback gate

The opt-in `scripts/windows-audio-loopback-acceptance.ps1` gate starts the real
CPAL input controller, plays a verified local SAPI WAV through Windows
PowerShell, drains the canonical mono 16 kHz DSP output, exercises the optional
Whisper handoff, and checks controller restart. It detects missing Windows,
PowerShell, WAV, or input-device capability before capture and preserves the
actual CPAL error when a device is unavailable.

Playback alone is **not** loopback evidence: the selected CPAL input may be a
microphone while the WAV is sent to speakers. The harness therefore prints
`route=unknown` and `UNVERIFIED` unless a human verifies that the selected input
is a Windows loopback or virtual route. No generated SAPI fixture is labeled as
microphone speech.
`route=unknown` and `UNVERIFIED` unless a human verifies that the selected input
is a Windows loopback or virtual route. No generated SAPI fixture is labeled as
microphone speech.

The evidence JSON distinguishes `corpus_manifest_verified` from
`playback_manifest_verified`; a custom WAV outside the corpus records only its
measured SHA-256 and RIFF header, not corpus provenance.

Example (no model required):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-audio-loopback-acceptance.ps1
```

Add `-DeviceId 'N:device name'` for an explicitly enumerated loopback/virtual
input. Add `-Transcribe` only with the existing user-owned Whisper executable,
model directory, and model environment configured; unavailable Whisper remains
a truthful gate failure rather than a fixture transcript.
