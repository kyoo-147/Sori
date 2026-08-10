use serde::{Deserialize, Serialize};
use time::Duration;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub text: String,
    pub start: Duration,
    pub end: Duration,
    pub confidence: Option<f32>,
    pub speaker: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Transcript {
    pub language: Option<String>,
    pub text: String,
    pub segments: Vec<TranscriptSegment>,
}

impl Transcript {
    pub fn plain(text: impl Into<String>) -> Self {
        let text = text.into();
        Self {
            language: None,
            text: text.clone(),
            segments: vec![TranscriptSegment {
                text,
                start: Duration::ZERO,
                end: Duration::ZERO,
                confidence: None,
                speaker: None,
            }],
        }
    }
}
