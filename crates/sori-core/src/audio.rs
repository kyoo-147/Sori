//! Platform-neutral contracts for microphone capture, DSP, and voice activity detection.
//!
//! Concrete platform adapters (for example a CPAL adapter) belong outside this crate.
//! Keeping these contracts platform-neutral lets the daemon and tests run without a
//! microphone or native audio backend.

use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioFormat {
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub sample_format: SampleFormat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SampleFormat {
    I16,
    F32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioChunk {
    pub captured_at: OffsetDateTime,
    pub format: AudioFormat,
    pub samples: Vec<f32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VoiceActivity {
    Silence,
    SpeechStarted,
    SpeechContinues,
    SpeechEnded,
}

/// Stable identity and user-facing metadata for an input device.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default_input: bool,
}

/// Platform boundary for device discovery. The first implementation may be a CPAL
/// adapter; callers must not depend on CPAL types or error values.
pub trait AudioDeviceProvider: Send + Sync {
    fn list_input_devices(&self) -> Result<Vec<AudioDeviceInfo>, AudioError>;
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CaptureConfig {
    pub device_id: Option<String>,
    pub format: AudioFormat,
    pub chunk_size_samples: u32,
}

impl Default for CaptureConfig {
    fn default() -> Self {
        Self {
            device_id: None,
            format: AudioFormat {
                sample_rate_hz: 16_000,
                channels: 1,
                sample_format: SampleFormat::F32,
            },
            chunk_size_samples: 320,
        }
    }
}

impl CaptureConfig {
    pub fn validate(&self) -> Result<(), AudioError> {
        if self.format.sample_rate_hz == 0 || self.format.channels == 0 {
            return Err(AudioError::InvalidConfiguration(
                "sample rate and channel count must be greater than zero".into(),
            ));
        }
        if self.chunk_size_samples == 0 {
            return Err(AudioError::InvalidConfiguration(
                "chunk size must be greater than zero".into(),
            ));
        }
        Ok(())
    }
}

/// Configuration for the capture-to-VAD DSP boundary. Processing is intentionally
/// a placeholder until a platform adapter and production DSP implementation land.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DspPipelineConfig {
    pub target_sample_rate_hz: u32,
    pub target_channels: u16,
    pub resample: bool,
    pub channel_mix: bool,
    pub noise_suppression: bool,
}

impl Default for DspPipelineConfig {
    fn default() -> Self {
        Self {
            target_sample_rate_hz: 16_000,
            target_channels: 1,
            resample: true,
            channel_mix: true,
            noise_suppression: false,
        }
    }
}

impl DspPipelineConfig {
    pub fn validate(&self) -> Result<(), AudioError> {
        if self.target_sample_rate_hz == 0 || self.target_channels == 0 {
            return Err(AudioError::InvalidConfiguration(
                "DSP target rate and channel count must be greater than zero".into(),
            ));
        }
        Ok(())
    }
}

/// Minimal VAD boundary. Implementations should be allocation-free on the capture
/// callback path where possible.
pub trait VoiceActivityDetector: Send {
    fn process(&mut self, samples: &[f32]) -> VoiceActivity;
    fn reset(&mut self);
}

/// Deterministic energy-based stub for tests and development. It is not suitable
/// for production speech detection.
#[derive(Debug, Clone)]
pub struct EnergyVadStub {
    threshold: f32,
    speaking: bool,
}

impl EnergyVadStub {
    pub fn new(threshold: f32) -> Self {
        Self {
            threshold: threshold.max(0.0),
            speaking: false,
        }
    }

    pub fn threshold(&self) -> f32 {
        self.threshold
    }
}

impl VoiceActivityDetector for EnergyVadStub {
    fn process(&mut self, samples: &[f32]) -> VoiceActivity {
        let active = !samples.is_empty()
            && samples.iter().map(|sample| sample.abs()).sum::<f32>() / samples.len() as f32
                >= self.threshold;
        let activity = match (self.speaking, active) {
            (false, false) => VoiceActivity::Silence,
            (false, true) => VoiceActivity::SpeechStarted,
            (true, true) => VoiceActivity::SpeechContinues,
            (true, false) => VoiceActivity::SpeechEnded,
        };
        self.speaking = active;
        activity
    }

    fn reset(&mut self) {
        self.speaking = false;
    }
}

pub trait AudioEngine: Send + Sync {
    fn input_format(&self) -> AudioFormat;
    fn next_chunk(&mut self) -> Result<Option<AudioChunk>, AudioError>;
}

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("microphone permission is missing")]
    MissingPermission,
    #[error("audio device is unavailable: {0}")]
    DeviceUnavailable(String),
    #[error("audio pipeline failed: {0}")]
    Pipeline(String),
    #[error("invalid audio configuration: {0}")]
    InvalidConfiguration(String),
    #[error("audio backend is not available: {0}")]
    BackendUnavailable(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_capture_config_targets_mono_whisper_input() {
        let config = CaptureConfig::default();
        assert_eq!(config.format.sample_rate_hz, 16_000);
        assert_eq!(config.format.channels, 1);
        assert!(config.validate().is_ok());
    }

    #[test]
    fn invalid_capture_config_is_rejected() {
        let config = CaptureConfig {
            chunk_size_samples: 0,
            ..CaptureConfig::default()
        };
        assert!(matches!(
            config.validate(),
            Err(AudioError::InvalidConfiguration(_))
        ));
    }

    #[test]
    fn dsp_config_defaults_to_mono_resampled_audio() {
        let config = DspPipelineConfig::default();
        assert_eq!(config.target_sample_rate_hz, 16_000);
        assert_eq!(config.target_channels, 1);
        assert!(config.resample);
        assert!(config.channel_mix);
        assert!(!config.noise_suppression);
        assert!(config.validate().is_ok());
    }

    #[test]
    fn vad_stub_reports_state_transitions() {
        let mut vad = EnergyVadStub::new(0.1);
        assert_eq!(vad.process(&[0.0, 0.0]), VoiceActivity::Silence);
        assert_eq!(vad.process(&[0.2, -0.2]), VoiceActivity::SpeechStarted);
        assert_eq!(vad.process(&[0.3]), VoiceActivity::SpeechContinues);
        assert_eq!(vad.process(&[0.0]), VoiceActivity::SpeechEnded);
        vad.reset();
        assert_eq!(vad.process(&[0.0]), VoiceActivity::Silence);
    }
}
