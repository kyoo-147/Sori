# Audio engine scaffold

The audio engine boundary lives in `sori-core::audio`. It deliberately does not
expose CPAL types: device discovery and capture are represented by
`AudioDeviceProvider` and `AudioEngine`, while `CaptureConfig` describes the
requested format and chunk size.

## Current scope

- `AudioDeviceInfo` and `AudioDeviceProvider` describe input-device listing.
- `CaptureConfig` defaults to mono 16 kHz `f32` audio in 20 ms chunks.
- `DspPipelineConfig` reserves stages for resampling, channel mixing, and noise
  suppression. It is configuration only for now.
- `VoiceActivityDetector` is the VAD boundary. `EnergyVadStub` is deterministic
  test scaffolding, not a production detector.

The `sori-audio` crate contains the CPAL adapter. It translates native device
and stream errors to `AudioError` and keeps CPAL types out of `sori-core`.
`CpalAudioEngine::start` selects the configured device (or the OS default),
starts a callback-backed bounded channel, and `stop` drops the stream.
`CpalAudioController` owns the CPAL stream on a worker thread and exposes an
`Idle -> Starting -> Recording -> Stopping` lifecycle. Each successful capture
has a monotonically increasing generation/session ID; stop and cancel are
idempotent. The callback uses `try_send`, so a slow consumer drops packets
rather than blocking the audio thread. Native stream disconnects are surfaced
as `DeviceUnavailable` rather than a fabricated success.

`next_chunk` drains the channel into the VAD-ready `f32` chunk shape; native
channel layouts are mixed to mono for now. Resampling and production DSP remain
future work. The core contracts and adapter conversion tests are
hardware-independent. No microphone is opened during `cargo test`.

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
   device whose native rate differs from 16 kHz. The current scaffold reports
   the native rate; resampling is not implemented yet.
7. Confirm that raw audio is not persisted by default and that stopping capture
   releases the device.
