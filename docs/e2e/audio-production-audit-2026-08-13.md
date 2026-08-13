# Worker A — production audio/DSP/VAD delivery report

**Status:** implementation complete; direct PR open: https://github.com/kyoo-147/Sori/pull/108
**Branch/commit:** `worker-a/audio-dsp-v1` / `a377f53`
**Scope:** `crates/sori-audio`, `crates/sori-core` audio, `crates/sorid` runtime, and audio documentation/tests.

## Root cause reproduced

The previous physical CPAL path had four production gaps:

1. CPAL exposed the native device sample rate as the Whisper-facing format. `DspPipelineConfig` was configuration-only, and the daemon used `EnergyVadStub`.
2. `DaemonRuntime::stop_audio` hard-capped collection at 64 chunks, truncating long recordings.
3. The controller handed worker output through a bounded eight-item queue; a slow daemon consumer could lose completed chunks.
4. Hardware error classification existed, but physical readiness and device disconnect/restart remained unverified.

## Delivered changes

- `sori-audio` retains native CPAL metadata, mixes interleaved channels to mono, and runs a stateful linear resampler to the configured 16 kHz target.
- The callback remains non-blocking (`try_send`); the worker-to-controller handoff is unbounded and is drained after the worker is stopped and joined.
- `sori-core` now provides `AudioDsp` and production `EnergyVad` with RMS thresholding and configurable end hangover. `EnergyVadStub` remains only as a compatibility/test boundary.
- `sorid` constructs the DSP/VAD session for every real capture, processes chunks through canonical runtime handling, and no longer limits collection to 64 chunks.
- Start readiness still reports success only after `Stream::play` succeeds. Permission, disconnect, and unavailable-device errors remain explicit `AudioError` values.
- Hotkey pressed/released/cancelled events continue through `DaemonRuntime::handle_hotkey` → `start_audio`/`stop_audio` → captured audio pipeline; no competing capture pipeline was added.

## Regression tests added/updated

- Stereo downmix plus 48 kHz → 16 kHz output shape and sample check.
- VAD speech start and hangover-based speech end.
- Existing CPAL lifecycle, cancellation, missing-device, and disconnect classification tests remain passing.
- Existing daemon hotkey and canonical IPC tests remain passing.

## Validation evidence

Executed from repository root:

```text
cargo test --workspace                         PASS
cargo check --workspace                        PASS
cargo clippy --workspace --all-targets -- -D warnings  PASS
git diff --check                              PASS
```

The workspace test run passed all active tests. The existing real Whisper fixture test remains ignored because it requires a real `whisper-cli`, model, and WAV fixture; it was not represented as audio hardware proof.

## Native/hardware boundary

**UNVERIFIED:** no physical Windows microphone session was available in this worker run. The following are not claimed as verified:

- Windows microphone permission grant/denial and restart recovery.
- Physical CPAL stream start on a real device.
- USB/Bluetooth device unplug/reconnect behavior.
- Physical global hotkey press/release timing into the capture path.
- Real Whisper inference from microphone audio.
- Focused-application insertion after a real dictation.
- Long-duration real-device capture performance.

The automated evidence is source-level and hardware-independent. It proves contracts, lifecycle behavior, DSP/VAD transformations, error mapping, and daemon tests; it does **not** prove physical microphone or native Windows behavior.

## Open-source references and license review

- CPAL repository and stream/device lifecycle reference: https://github.com/RustAudio/cpal — Apache-2.0.
- CPAL resampling discussion: https://github.com/RustAudio/cpal/issues/753.

Sori uses CPAL as its existing low-level capture adapter and implements the small DSP stage locally; no third-party capture pipeline was copied or introduced.
