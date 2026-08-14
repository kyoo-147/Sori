//! Deterministic benchmark contracts and runner for real provider seams.

use crate::{AudioChunk, CancellationToken, ModelError, ModelId, ModelProvider};
use serde::{Deserialize, Serialize};
use std::time::Instant;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct LatencyMetrics {
    pub p50_ms: f64,
    pub p95_ms: f64,
}
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AccuracyMetrics {
    pub wer: Option<f64>,
    pub cer: Option<f64>,
}
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MemoryMetrics {
    pub ram_bytes: Option<u64>,
    pub vram_bytes: Option<u64>,
}
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct StartupMetrics {
    pub cold_ms: f64,
    pub warm_ms: f64,
}
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ReliabilityMetrics {
    pub failure_rate: f64,
    pub fallback_rate: Option<f64>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub run_id: Uuid,
    pub started_at: OffsetDateTime,
    pub completed_at: OffsetDateTime,
    pub model: ModelId,
    pub provider: String,
    pub samples: usize,
    pub attempts: usize,
    pub latency: LatencyMetrics,
    pub real_time_factor: f64,
    pub memory: MemoryMetrics,
    pub accuracy: Option<AccuracyMetrics>,
    pub startup: StartupMetrics,
    pub reliability: ReliabilityMetrics,
}
impl BenchmarkResult {
    pub fn is_realtime(&self) -> bool {
        self.real_time_factor <= 1.0
    }
}

/// Select a recommendation deterministically, independent of persistence order.
pub fn recommend_benchmark(results: &[BenchmarkResult]) -> Option<&BenchmarkResult> {
    results.iter().min_by(|left, right| {
        left.reliability
            .failure_rate
            .total_cmp(&right.reliability.failure_rate)
            .then_with(|| {
                left.reliability
                    .fallback_rate
                    .unwrap_or(1.0)
                    .total_cmp(&right.reliability.fallback_rate.unwrap_or(1.0))
            })
            .then_with(|| left.latency.p95_ms.total_cmp(&right.latency.p95_ms))
            .then_with(|| left.latency.p50_ms.total_cmp(&right.latency.p50_ms))
            .then_with(|| left.real_time_factor.total_cmp(&right.real_time_factor))
            .then_with(|| left.provider.cmp(&right.provider))
            .then_with(|| left.model.0.cmp(&right.model.0))
            .then_with(|| left.run_id.cmp(&right.run_id))
    })
}

#[derive(Debug, Clone)]
pub struct BenchmarkInput {
    pub model: ModelId,
    pub audio: Vec<AudioChunk>,
    pub reference: Option<String>,
    pub iterations: usize,
}

#[derive(Debug, Clone)]
pub struct BenchmarkOptions {
    pub cancellation: CancellationToken,
    pub timeout: Option<std::time::Duration>,
}
impl Default for BenchmarkOptions {
    fn default() -> Self {
        Self {
            cancellation: CancellationToken::new(),
            timeout: None,
        }
    }
}

pub fn run_benchmark(
    provider: &dyn ModelProvider,
    input: &BenchmarkInput,
) -> Result<BenchmarkResult, ModelError> {
    run_benchmark_with_options(provider, input, &BenchmarkOptions::default())
}

pub fn run_benchmark_with_options(
    provider: &dyn ModelProvider,
    input: &BenchmarkInput,
    options: &BenchmarkOptions,
) -> Result<BenchmarkResult, ModelError> {
    let run_id = Uuid::new_v4();
    let started_at = OffsetDateTime::now_utc();
    let iterations = input.iterations.max(2);
    let benchmark_started = Instant::now();
    // Keep invocation order for cold/warm semantics; derive sorted samples only
    // for order-independent percentile metrics.
    let mut invocation_elapsed = Vec::with_capacity(iterations);
    let mut failures = 0usize;
    let mut transcript = None;
    for _ in 0..iterations {
        if options.cancellation.is_cancelled() {
            return Err(ModelError::Inference("benchmark cancelled".into()));
        }
        if options
            .timeout
            .is_some_and(|timeout| benchmark_started.elapsed() >= timeout)
        {
            return Err(ModelError::Inference("benchmark timed out".into()));
        }
        let started = Instant::now();
        match provider.transcribe_with_cancellation(
            &input.model,
            &input.audio,
            &options.cancellation,
        ) {
            Ok(value) => {
                transcript = Some(value);
                invocation_elapsed.push(started.elapsed().as_secs_f64() * 1000.0);
            }
            Err(_error) => failures += 1,
        }
    }
    if options.cancellation.is_cancelled() {
        return Err(ModelError::Inference("benchmark cancelled".into()));
    }
    if invocation_elapsed.is_empty() {
        return Err(ModelError::Inference("all benchmark samples failed".into()));
    }
    let successful_samples = invocation_elapsed.len();
    let mut sorted_elapsed = invocation_elapsed.clone();
    sorted_elapsed.sort_by(f64::total_cmp);
    let percentile = |p: f64| {
        sorted_elapsed
            [((p * (successful_samples - 1) as f64).round() as usize).min(successful_samples - 1)]
    };
    let warm = if invocation_elapsed.len() > 1 {
        &invocation_elapsed[1..]
    } else {
        &invocation_elapsed[..]
    };
    let warm_ms = warm.iter().sum::<f64>() / warm.len() as f64;
    let audio_seconds = input
        .audio
        .iter()
        .map(|chunk| {
            chunk.samples.len() as f64
                / (chunk.format.sample_rate_hz as f64 * chunk.format.channels as f64)
        })
        .sum::<f64>();
    let rtf = (invocation_elapsed.iter().sum::<f64>() / successful_samples as f64 / 1000.0)
        / audio_seconds.max(f64::MIN_POSITIVE);
    let accuracy = input.reference.as_deref().map(|reference| {
        let actual = transcript.as_ref().map(|t| t.text.as_str()).unwrap_or("");
        AccuracyMetrics {
            wer: Some(error_rate(&words(reference), &words(actual))),
            cer: Some(error_rate(&chars(reference), &chars(actual))),
        }
    });
    Ok(BenchmarkResult {
        run_id,
        started_at,
        completed_at: OffsetDateTime::now_utc(),
        model: input.model.clone(),
        provider: provider.provider_name().into(),
        samples: successful_samples,
        attempts: iterations,
        latency: LatencyMetrics {
            p50_ms: percentile(0.50),
            p95_ms: percentile(0.95),
        },
        real_time_factor: rtf,
        memory: MemoryMetrics {
            ram_bytes: None,
            vram_bytes: None,
        },
        accuracy,
        startup: StartupMetrics {
            cold_ms: invocation_elapsed[0],
            warm_ms,
        },
        reliability: ReliabilityMetrics {
            // Failures use all attempted invocations as their denominator;
            // percentile metrics use successful invocations only.
            failure_rate: failures as f64 / iterations as f64,
            fallback_rate: None,
        },
    })
}
fn words(s: &str) -> Vec<String> {
    s.split_whitespace().map(|w| w.to_lowercase()).collect()
}
fn chars(s: &str) -> Vec<char> {
    s.chars()
        .map(|c| c.to_lowercase().next().unwrap_or(c))
        .collect()
}
fn error_rate<T: PartialEq>(reference: &[T], actual: &[T]) -> f64 {
    if reference.is_empty() {
        return if actual.is_empty() { 0.0 } else { 1.0 };
    }
    let mut row: Vec<usize> = (0..=actual.len()).collect();
    for (i, r) in reference.iter().enumerate() {
        let mut next = vec![i + 1; actual.len() + 1];
        for (j, a) in actual.iter().enumerate() {
            next[j + 1] = (row[j + 1] + 1)
                .min(next[j] + 1)
                .min(row[j] + usize::from(r != a));
        }
        row = next;
    }
    row[actual.len()] as f64 / reference.len() as f64
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AudioFormat, SampleFormat, Transcript};
    struct Provider;
    impl ModelProvider for Provider {
        fn provider_name(&self) -> &'static str {
            "test"
        }
        fn can_transcribe(&self, _: &ModelId) -> bool {
            true
        }
        fn transcribe(&self, _: &ModelId, _: &[AudioChunk]) -> Result<Transcript, ModelError> {
            Ok(Transcript::plain("hello world"))
        }
    }
    struct InvocationOrderedProvider {
        calls: std::sync::atomic::AtomicUsize,
    }
    impl ModelProvider for InvocationOrderedProvider {
        fn provider_name(&self) -> &'static str {
            "ordered-test"
        }
        fn can_transcribe(&self, _: &ModelId) -> bool {
            true
        }
        fn transcribe(&self, _: &ModelId, _: &[AudioChunk]) -> Result<Transcript, ModelError> {
            let call = self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            if call == 0 {
                std::thread::sleep(std::time::Duration::from_millis(20));
            } else {
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
            Ok(Transcript::plain("hello world"))
        }
    }
    #[test]
    fn cold_is_first_successful_invocation_not_fastest_sample() {
        let r = run_benchmark(
            &InvocationOrderedProvider {
                calls: std::sync::atomic::AtomicUsize::new(0),
            },
            &BenchmarkInput {
                model: ModelId::from("x"),
                audio: audio(),
                reference: None,
                iterations: 3,
            },
        )
        .unwrap();

        assert!(r.startup.cold_ms > r.startup.warm_ms);
        assert!(r.startup.cold_ms > r.latency.p50_ms);
    }
    fn audio() -> Vec<AudioChunk> {
        vec![AudioChunk {
            captured_at: time::OffsetDateTime::UNIX_EPOCH,
            format: AudioFormat {
                sample_rate_hz: 100,
                channels: 1,
                sample_format: SampleFormat::F32,
            },
            samples: vec![0.0; 100],
        }]
    }
    #[test]
    fn cancellation_is_an_error_and_never_returns_partial_result() {
        let token = CancellationToken::new();
        token.cancel();
        let result = run_benchmark_with_options(
            &Provider,
            &BenchmarkInput {
                model: ModelId::from("x"),
                audio: audio(),
                reference: None,
                iterations: 3,
            },
            &BenchmarkOptions {
                cancellation: token,
                timeout: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("cancelled"));
    }

    #[test]
    fn timeout_is_an_error_before_provider_work() {
        let result = run_benchmark_with_options(
            &Provider,
            &BenchmarkInput {
                model: ModelId::from("x"),
                audio: audio(),
                reference: None,
                iterations: 3,
            },
            &BenchmarkOptions {
                cancellation: CancellationToken::new(),
                timeout: Some(std::time::Duration::ZERO),
            },
        );
        assert!(result.unwrap_err().to_string().contains("timed out"));
    }

    #[test]
    fn runner_reports_real_samples_and_accuracy() {
        let r = run_benchmark(
            &Provider,
            &BenchmarkInput {
                model: ModelId::from("x"),
                audio: audio(),
                reference: Some("hello rust".into()),
                iterations: 3,
            },
        )
        .unwrap();
        assert_eq!(r.samples, 3);
        assert!(r.accuracy.unwrap().wer.unwrap() > 0.0);
    }
    #[test]
    fn empty_reference_is_explicit_zero_or_full() {
        assert_eq!(error_rate::<char>(&[], &[]), 0.0);
        assert_eq!(error_rate::<char>(&[], &['x']), 1.0);
    }
}
