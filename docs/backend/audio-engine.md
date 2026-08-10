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

CPAL is intentionally not a dependency in this scaffold. Adding it would pull
platform-specific native backend behavior into the core crate before a concrete
adapter and supported-device matrix exist. The contracts can be validated on
Windows and Linux CI without requiring an audio device. A future adapter crate
can depend on CPAL and translate its device/configuration errors to
`AudioError`; this keeps the core build portable and makes that dependency an
explicit platform integration decision.

## Manual microphone testing plan

1. Grant Sori microphone permission in the operating system privacy settings.
2. Enumerate input devices and confirm the expected default device name and id.
3. Start capture with the default `CaptureConfig`; verify the selected device,
   sample rate, channel count, and chunk duration in diagnostics.
4. Speak, pause, and speak again. Confirm the VAD sequence is
   `SpeechStarted`, `SpeechContinues`, `SpeechEnded` and that silence does not
   create transcript work.
5. Test a non-default input device and unplug it during capture; report a clear
   `DeviceUnavailable` error and ensure the daemon remains usable.
6. Repeat on Windows and Linux with Bluetooth and USB microphones, including a
   device whose native rate differs from 16 kHz, once the CPAL adapter exists.
7. Confirm that raw audio is not persisted by default and that stopping capture
   releases the device.
