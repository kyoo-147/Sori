//! Data contracts for measuring transcription providers and routes.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct LatencyMetrics {
    /// End-to-end latency in milliseconds.
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
    pub ram_bytes: u64,
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
    pub latency: LatencyMetrics,
    /// Real-time factor: processing time divided by audio duration.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accuracy_can_be_omitted_for_non_asr_benchmarks() {
        let result = BenchmarkResult {
            latency: LatencyMetrics {
                p50_ms: 10.0,
                p95_ms: 20.0,
            },
            real_time_factor: 0.5,
            memory: MemoryMetrics {
                ram_bytes: 1,
                vram_bytes: None,
            },
            accuracy: None,
            startup: StartupMetrics {
                cold_ms: 100.0,
                warm_ms: 2.0,
            },
            reliability: ReliabilityMetrics {
                failure_rate: 0.0,
                fallback_rate: 0.0,
            },
        };
        assert!(result.is_realtime());
    }
}
