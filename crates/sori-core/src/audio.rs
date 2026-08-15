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
    #[serde(with = "time::serde::rfc3339")]
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

fn default_input_gain_percent() -> u16 {
    100
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CaptureConfig {
    pub device_id: Option<String>,
    pub format: AudioFormat,
    pub chunk_size_samples: u32,
    /// Percentage of native input amplitude applied before DSP (100 = unity).
    #[serde(default = "default_input_gain_percent")]
    pub input_gain_percent: u16,
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
            input_gain_percent: 100,
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
        if self.input_gain_percent > 1_000 {
            return Err(AudioError::InvalidConfiguration(
                "input gain must be between 0% and 1000%".into(),
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

#[derive(Debug, Clone)]
pub struct AudioDsp {
    config: DspPipelineConfig,
    carry: Vec<f32>,
    phase: f64,
}

impl AudioDsp {
    pub fn new(config: DspPipelineConfig) -> Result<Self, AudioError> {
        config.validate()?;
        Ok(Self {
            config,
            carry: Vec::new(),
            phase: 0.0,
        })
    }

    pub fn process(&mut self, chunk: &AudioChunk) -> Result<AudioChunk, AudioError> {
        let input_rate = chunk.format.sample_rate_hz;
        if input_rate == 0 || chunk.format.channels == 0 {
            return Err(AudioError::InvalidConfiguration(
                "input audio format is invalid".into(),
            ));
        }
        let mono = if chunk.format.channels == 1 {
            chunk.samples.clone()
        } else {
            chunk
                .samples
                .chunks(chunk.format.channels as usize)
                .map(|frame| frame.iter().copied().sum::<f32>() / frame.len() as f32)
                .collect()
        };
        let samples = if input_rate == self.config.target_sample_rate_hz {
            mono
        } else {
            linear_resample(
                &mono,
                input_rate,
                self.config.target_sample_rate_hz,
                &mut self.carry,
                &mut self.phase,
            )
        };
        Ok(AudioChunk {
            captured_at: chunk.captured_at,
            format: AudioFormat {
                sample_rate_hz: self.config.target_sample_rate_hz,
                channels: 1,
                sample_format: SampleFormat::F32,
            },
            samples,
        })
    }
}

fn linear_resample(
    input: &[f32],
    from: u32,
    to: u32,
    carry: &mut Vec<f32>,
    phase: &mut f64,
) -> Vec<f32> {
    if input.is_empty() {
        return Vec::new();
    }
    let mut source = std::mem::take(carry);
    source.extend_from_slice(input);
    let step = from as f64 / to as f64;
    let mut position = *phase;
    let mut output = Vec::new();
    while position + 1.0 < source.len() as f64 {
        let left = position.floor() as usize;
        let fraction = (position - left as f64) as f32;
        output.push(source[left] * (1.0 - fraction) + source[left + 1] * fraction);
        position += step;
    }
    let consumed = position.floor().min(source.len() as f64) as usize;
    *phase = position - consumed as f64;
    *carry = source[consumed..].to_vec();
    output
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
pub struct EnergyVad {
    threshold: f32,
    end_hangover: u32,
    silent_chunks: u32,
    speaking: bool,
}

impl EnergyVad {
    pub fn new(threshold: f32, end_hangover: u32) -> Self {
        Self {
            threshold: threshold.max(0.0),
            end_hangover: end_hangover.max(1),
            silent_chunks: 0,
            speaking: false,
        }
    }
}

impl VoiceActivityDetector for EnergyVad {
    fn process(&mut self, samples: &[f32]) -> VoiceActivity {
        let rms = if samples.is_empty() {
            0.0
        } else {
            (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
        };
        if rms >= self.threshold {
            let activity = if self.speaking {
                VoiceActivity::SpeechContinues
            } else {
                VoiceActivity::SpeechStarted
            };
            self.speaking = true;
            self.silent_chunks = 0;
            activity
        } else if self.speaking {
            self.silent_chunks += 1;
            if self.silent_chunks >= self.end_hangover {
                self.speaking = false;
                self.silent_chunks = 0;
                VoiceActivity::SpeechEnded
            } else {
                VoiceActivity::SpeechContinues
            }
        } else {
            VoiceActivity::Silence
        }
    }
    fn reset(&mut self) {
        self.speaking = false;
        self.silent_chunks = 0;
    }
}

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

/// A capture engine with an explicit lifecycle. Implementations must only report
/// success after the native input stream is actually running.
pub trait AudioCaptureEngine: AudioEngine + Send {
    fn start_capture(&mut self) -> Result<AudioDeviceInfo, AudioError>;
    fn stop_capture(&mut self);
    fn is_running(&self) -> bool;
    /// Check configured-device discovery and native input configuration without
    /// claiming that a recording stream has been started.
    fn readiness(&self) -> Result<(), AudioError> {
        Ok(())
    }
}

pub trait AudioEngine {
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
    fn invalid_input_gain_is_rejected() {
        let config = CaptureConfig {
            input_gain_percent: 1_001,
            ..CaptureConfig::default()
        };
        assert!(matches!(
            config.validate(),
            Err(AudioError::InvalidConfiguration(_))
        ));
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

#[cfg(test)]
mod production_audio_tests {
    use super::*;

    fn chunk(rate: u32, channels: u16, samples: Vec<f32>) -> AudioChunk {
        AudioChunk {
            captured_at: OffsetDateTime::UNIX_EPOCH,
            format: AudioFormat {
                sample_rate_hz: rate,
                channels,
                sample_format: SampleFormat::F32,
            },
            samples,
        }
    }

    #[test]
    fn dsp_mixes_stereo_and_resamples_to_16khz() {
        let mut dsp = AudioDsp::new(DspPipelineConfig::default()).unwrap();
        let output = dsp
            .process(&chunk(
                48_000,
                2,
                vec![1.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0],
            ))
            .unwrap();
        assert_eq!(output.format.sample_rate_hz, 16_000);
        assert_eq!(output.format.channels, 1);
        assert_eq!(output.samples.len(), 2);
        assert!((output.samples[0] - 0.5).abs() < 0.001);
        assert!(output.samples[1].abs() < 0.001);
    }

    #[test]
    fn resampling_preserves_progress_across_input_chunks() {
        let mut dsp = AudioDsp::new(DspPipelineConfig::default()).unwrap();
        let first = dsp.process(&chunk(48_000, 1, vec![0.5; 480])).unwrap();
        let second = dsp.process(&chunk(48_000, 1, vec![0.5; 480])).unwrap();
        assert_eq!(first.samples.len() + second.samples.len(), 320);
        assert!(
            first
                .samples
                .iter()
                .chain(second.samples.iter())
                .all(|sample| (*sample - 0.5).abs() < 0.001)
        );
    }

    #[test]
    fn vad_requires_hangover_before_ending_speech() {
        let mut vad = EnergyVad::new(0.1, 2);
        assert_eq!(vad.process(&[0.2, -0.2]), VoiceActivity::SpeechStarted);
        assert_eq!(vad.process(&[0.0]), VoiceActivity::SpeechContinues);
        assert_eq!(vad.process(&[0.0]), VoiceActivity::SpeechEnded);
    }
}
