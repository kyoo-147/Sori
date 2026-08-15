## Upstream pattern and license evidence

The implementation follows the sidecar-and-temporary-file pattern used by
[OpenWhispr](https://github.com/OpenWhispr/openwhispr) (MIT application, with
local Whisper/whisper.cpp engines), while preserving Sori's Rust
`ModelProvider` boundary. [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
is MIT-licensed; the [OpenAI Whisper repository](https://github.com/openai/whisper)
is also MIT-licensed. These upstream software licenses do **not** automatically
license downloaded model weights: each model manifest must carry its own source,
license, attribution, and checksum before distribution.

OpenSuperWhisper is retained as a product reference in
[`docs/Clone_repo.md`](../Clone_repo.md); Sori does not copy code or assets from
it. Its application/model terms must be reviewed independently before using any
artifact.

## Runtime lifecycle

`WhisperCppProvider` now owns truthful `load`, `warm`, `unload`, and
`remove_model` operations. Load/warm require a verified executable and model;
unload only clears Sori's runtime state because the CLI is a short-lived sidecar
and has no persistent in-process context to unload. Removal deletes only a
verified file below the configured model directory. The provider registry in
`sori-core` rejects duplicate provider names and keeps routing on the canonical
`ModelProvider` trait.
# whisper.cpp provider strategy

## Recommendation for the MVP

Use a **sidecar command process** (the whisper.cpp CLI) behind the provider boundary.
The `sori-provider-whisper` crate contains manifests, route selection, and command
construction, but intentionally does not download, compile, or link native whisper
code. The provider encodes `AudioChunk` samples as PCM16 WAV, while the production
command runner owns child-process lifetime, cancellation, timeouts, and stderr capture.

This keeps `sori-core` independent of Whisper and makes the provider replaceable. It

The provider exposes `discover_models()` for file-backed model discovery,
`verified_model_path()` for canonical, model-directory-contained resolution, and
`WhisperLifecycle`/`WhisperStatus` (`Unavailable`, `Loading`, `Ready`, `Running`,
`Failed`, `Downloading`) for truthful UI/runtime reporting. Timed runner calls return
`TranscriptionResult` with measured wall-clock latency. Provider tests use the
`ProcessRunner` seam, so missing binaries/models, cancellation, non-zero exits,
malformed output, and cleanup failures remain explicit errors rather than fake
transcripts.
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

## Managed install and hardware boundary

`WhisperCppProvider::install_model_from_file` is the reproducible install seam: it
accepts a user-supplied artifact, verifies an optional SHA-256, writes only below
`SORI_WHISPER_MODEL_DIR`, and renames atomically. Sori intentionally does not fetch
arbitrary URLs or execute downloaded code; a host may download an artifact after
showing its license, URL, checksum, and disk estimate. Installation reports
`Downloading` with 0/100 progress and ends in `Ready` or `Failed`.

`whisper.cpp` availability proves only that the executable and model were found.
It does not prove a microphone, OS permission, CPU/GPU acceleration, hotkey,
focused-app target, or text injection. Those remain `UNVERIFIED` until a native
machine test. The ignored `real_fixture_transcription_smoke` test is the explicit
real-process boundary and requires `SORI_WHISPER_CPP_BIN`,
`SORI_WHISPER_MODEL_DIR`, `SORI_WHISPER_MODEL`, and `SORI_WHISPER_FIXTURE_WAV`.

## Manual installation

The provider also reads a restart-persistent JSON configuration file. Set
`SORI_WHISPER_CONFIG` to an explicit file, or use the Windows default
`%LOCALAPPDATA%\Sori\whisper.json` (portable/non-Windows default:
`$XDG_CONFIG_HOME/sori/whisper.json`). The file is user-owned and is never
created, downloaded, or populated by Sori:

```json
{
  "executable": "C:\\Tools\\whisper.cpp\\whisper-cli.exe",
  "model_dir": "C:\\Users\\me\\Models\\whisper"
}
```

Environment variables take precedence over file values, and PATH discovery is
the final fallback. Missing or malformed explicit configuration fails closed.
The daemon re-reads this configuration on every restart, so changing the
installation does not require editing the repository or committing binaries.

The provider expects a separately installed whisper.cpp CLI and model; it never
vendors either one. Build or download `whisper-cli` (or the legacy `main` binary)
and verify that it can run from a terminal. Configure the executable with
`SORI_WHISPER_CPP_BIN` (or `WHISPER_CPP_BIN`) and the directory containing the
model files with `SORI_WHISPER_MODEL_DIR` (or `WHISPER_CPP_MODEL_DIR`). A model
manifest id is resolved as a file name below that directory (for example,
`models/ggml-base.en.bin`). Missing binaries, directories, and model files are
reported as provider errors before a process is launched.

The command builder passes arguments directly (never through a shell), including
`-m <model> -f <wav> -otxt|-oj|-osrt -of <output-prefix>`.
The production runner drains stdout and stderr concurrently, supervises the child without shell interpolation, and joins its readers after normal exit, cancellation, or timeout so verbose sidecars cannot deadlock the daemon. A successful process normally produces the requested output file; compatible builds that emit the selected format only on stdout are parsed as a fallback. Non-zero exit status, empty output, malformed output, timeout, and cancellation remain errors.
Use `transcribe_audio_with_runner_options` with `CommandProcessRunner` for production;
the provider removes temporary input/output files on every return path and reports
cleanup failures. Text, whisper.cpp JSON, and SRT output are parsed only after a
successful exit status. Cancellation and timeout errors do not produce a transcript.
The daemon constructs `WhisperCppProvider` from these settings and registers it
behind `DaemonRuntime`. Its loopback IPC `Dictation { model, audio }` request accepts
captured `Vec<AudioChunk>` data and calls `DaemonRuntime::transcribe`, which invokes
the configured provider through the existing `ModelProvider` contract. Capture and
injection adapters remain outside this provider boundary.

## Windows manual smoke test

1. Install a whisper.cpp Windows build matching the daemon architecture and verify
   `whisper-cli.exe --help` in PowerShell. Do not commit the executable.
2. Download a compatible model from its upstream source, record its license/checksum,
   and place it in a user-owned model directory. Do not commit model files.
3. Set `SORI_WHISPER_CPP_BIN` and `SORI_WHISPER_MODEL_DIR` to those paths.
4. Start `sorid`; startup discovery must report missing prerequisites immediately.
5. Send a loopback IPC `Dictation` request containing captured `AudioChunk` JSON data
   (the response is `Transcript` only after a successful whisper.cpp exit). Verify
   that missing prerequisites, malformed output, non-zero exit, timeout, cancellation,
   and cleanup failures are errors, never fabricated transcripts.
6. Remove temporary installation files according to local retention policy; captured
   audio is not intended to be persisted by Sori.
