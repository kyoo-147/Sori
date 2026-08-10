# Benchmark and route routing scaffolding

The core crate contains the initial contracts for comparing model runtimes and
explaining route selection. This is data-model scaffolding; collecting real
samples and connecting providers are not wired yet.

## Benchmark results

`BenchmarkResult` records p50/p95 end-to-end latency, real-time factor, RAM and
optional VRAM usage, optional WER/CER, cold and warm startup latency, and
failure/fallback rates. Rates and accuracy values are represented as fractions
(for example, `0.05` means 5%). `BenchmarkResult::is_realtime` reports whether
RTF is at most 1.0.

## Presets

`RoutePreset` currently includes:

- `Performance`: prioritize a warm/fast route and permit cloud use.
- `Balanced`: prefer local, with cloud fallback.
- `Battery`: prefer local and avoid cloud while optimizing power.
- `Privacy` and `NeverCloud`: local only; never send audio to cloud.
- `LocalFirst`: local preferred, cloud fallback permitted.
- `CloudAllowed`: cloud is permitted when local is not preferred/available.

`RouteSimulatorInput` is intentionally small: it describes preset, local/cloud
availability, and whether the local runtime is warm. `explain_route` returns
the selected target, an optional fallback, and human-readable reasons. Future
routing work can add benchmark scores, network state, consent, and model
capabilities without changing the result contract's purpose.

The CLI placeholder is available as `sori benchmark` and reports that execution
is not wired yet.
