# whisper.cpp provider strategy

## Recommendation for the MVP

Use a **sidecar command process** (the whisper.cpp CLI) behind the provider boundary.
The `sori-provider-whisper` crate contains manifests, route selection, and command
construction, but intentionally does not download, compile, or link native whisper
code. The host supervisor should own WAV/PCM encoding, process lifetime, cancellation,
timeouts, stderr capture, and parsing the output into `Transcript`.

This keeps `sori-core` independent of Whisper and makes the provider replaceable. It
also lets packaged releases ship a tested whisper.cpp binary per platform without
making Rust builds depend on CMake, CUDA, Metal, or platform toolchains.

## Options considered

- **Command process:** best MVP boundary. It is easy to diagnose and update, and the
  executable can be replaced independently. The cost is process startup and careful
  temporary-file/stdin handling.
- **FFI:** lowest overhead after integration, but adds native build, ABI, feature,
  and distribution complexity. It should be an optimization once profiling proves
  startup overhead matters.
- **`whisper-rs`:** a convenient Rust API, but still wraps native whisper.cpp and
  inherits its build/linking and backend feature risks. Revisit when a stable
  prebuilt/native packaging story exists.
- **Generic sidecar service:** useful for a long-lived worker and streaming, but
  more lifecycle and protocol surface than the first dictation path needs.

## Runtime and install risks

- The executable and model file must match the supported whisper.cpp CLI contract;
  model identifiers in manifests are not file downloads by themselves.
- Windows packaging must handle executable discovery, antivirus quarantine, quoting,
  and architecture-specific binaries. Never interpolate user strings into a shell;
  pass arguments directly to `Command`.
- Model licenses, download URLs, checksums, disk space, and RAM estimates need to be
  shown before installation. Estimates vary by quantization and backend.
- CPU-only fallback should be explicit. GPU backends (CUDA, Metal, Vulkan) need
  separate binaries or build features and can fail at runtime despite a successful
  install.
- Do not persist captured audio by default. Use bounded temporary files and remove
  them on success, failure, and cancellation.

The placeholder provider currently returns an explicit `Inference` error from
`transcribe`; this is deliberate until the daemon's process supervisor and audio
serialization contracts are available.
