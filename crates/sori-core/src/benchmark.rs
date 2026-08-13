//! Deterministic benchmark contracts and runner for real provider seams.

use crate::{AudioChunk, ModelError, ModelId, ModelProvider};
use serde::{Deserialize, Serialize};
use std::time::Instant;

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
    pub fallback_rate: f64,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub model: ModelId,
    pub provider: String,
    pub samples: usize,
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

#[derive(Debug, Clone)]
pub struct BenchmarkInput {
    pub model: ModelId,
    pub audio: Vec<AudioChunk>,
    pub reference: Option<String>,
    pub iterations: usize,
}

pub fn run_benchmark(
    provider: &dyn ModelProvider,
    input: &BenchmarkInput,
) -> Result<BenchmarkResult, ModelError> {
    let iterations = input.iterations.max(2);
    let mut elapsed = Vec::with_capacity(iterations);
    let mut failures = 0usize;
    let mut transcript = None;
    for _ in 0..iterations {
        let started = Instant::now();
        match provider.transcribe(&input.model, &input.audio) {
            Ok(value) => {
                transcript = Some(value);
                elapsed.push(started.elapsed().as_secs_f64() * 1000.0);
            }
            Err(_error) => failures += 1,
        }
    }
    if elapsed.is_empty() {
        return Err(ModelError::Inference("all benchmark samples failed".into()));
    }
    elapsed.sort_by(f64::total_cmp);
    let percentile = |p: f64| {
        elapsed[((p * (elapsed.len() - 1) as f64).round() as usize).min(elapsed.len() - 1)]
    };
    let warm = if elapsed.len() > 1 {
        &elapsed[1..]
    } else {
        &elapsed[..]
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
    let rtf = (elapsed.iter().sum::<f64>() / elapsed.len() as f64 / 1000.0)
        / audio_seconds.max(f64::MIN_POSITIVE);
    let accuracy = input.reference.as_deref().map(|reference| {
        let actual = transcript.as_ref().map(|t| t.text.as_str()).unwrap_or("");
        AccuracyMetrics {
            wer: Some(error_rate(&words(reference), &words(actual))),
            cer: Some(error_rate(&chars(reference), &chars(actual))),
        }
    });
    Ok(BenchmarkResult {
        model: input.model.clone(),
        provider: provider.provider_name().into(),
        samples: elapsed.len(),
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
            cold_ms: elapsed[0],
            warm_ms,
        },
        reliability: ReliabilityMetrics {
            failure_rate: failures as f64 / iterations as f64,
            fallback_rate: 0.0,
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
