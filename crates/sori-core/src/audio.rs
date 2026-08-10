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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_format_records_hot_path_shape() {
        let format = AudioFormat {
            sample_rate_hz: 16_000,
            channels: 1,
            sample_format: SampleFormat::F32,
        };
        assert_eq!(format.sample_rate_hz, 16_000);
    }
}
