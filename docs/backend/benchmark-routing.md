# Benchmark runner and route recommendations

Sori benchmarks are provider-backed measurements, not UI rehearsals. `sori benchmark`
accepts a mono PCM16 WAV, sends it to `sorid` over loopback IPC, invokes the configured
`ModelProvider`, records one cold sample plus warm samples, and persists the result in
SQLite (`benchmark_runs`). The daemon returns an explicit IPC error when the provider,
model, or audio prerequisite is unavailable.

```powershell
sori benchmark --model ggml-base.en.bin --audio .\fixtures\sample.wav --reference "reference transcript" --iterations 5
```

The runner reports cold/warm latency, p50/p95, real-time factor, failure rate, and
optional WER/CER. WER/CER are only computed when a caller supplies a reference string;
there is no bundled reference dataset in this repository, so unlabelled audio is
`UNVERIFIED` for accuracy. RAM/VRAM are also `UNVERIFIED` until a provider exposes
process-level resource telemetry; the runner does not print zero as a fake measurement.

The desktop must use `run_benchmark` and `apply_benchmark_recommendation` IPC operations
for future benchmark controls. Applying a recommendation persists the selected
provider/model route under `model_routes.recommended`; it does not claim that a route
was applied to audio until the runtime router consumes that persisted route.

## Reference implementations and licenses

- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) provides `whisper-bench` and
  `scripts/bench.py`; its repository is MIT licensed. Its benchmark is encoder-focused,
  so Sori measures the canonical provider call and full supplied audio duration instead.
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) publishes comparative
  time/memory measurements and is MIT licensed. It is a useful methodology reference,
  not a runtime dependency.
- Public speech corpora must be introduced with a separate license and attribution
  record. Until then, Sori accepts a caller-owned WAV and reference boundary explicitly.

## Validation boundary

Deterministic core tests use a test `ModelProvider` only to verify sampling, percentile,
RTF, and edit-distance math. They do not count as local model evidence. Real evidence
requires a running intended `sorid`, an installed whisper.cpp executable/model, and a
caller-supplied WAV; if any prerequisite is absent, record `UNVERIFIED/SKIP` rather than
fabricating results.
