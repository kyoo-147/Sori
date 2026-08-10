use crate::{AudioChunk, ContextSnapshot, Transcript};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct ModelId(pub String);

impl From<&str> for ModelId {
    fn from(value: &str) -> Self {
        Self(value.to_owned())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelRoute {
    pub provider: String,
    pub model: ModelId,
    pub reason: String,
    pub fallback: Vec<ModelId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeStatus {
    pub model: ModelId,
    pub installed: bool,
    pub loaded: bool,
    pub warm: bool,
    pub memory_bytes: Option<u64>,
    pub backend: Option<String>,
}

pub trait ModelProvider: Send + Sync {
    fn provider_name(&self) -> &'static str;
    fn can_transcribe(&self, model: &ModelId) -> bool;
    fn transcribe(&self, model: &ModelId, audio: &[AudioChunk]) -> Result<Transcript, ModelError>;
}

pub trait ModelRuntime: Send + Sync {
    fn status(&self, model: &ModelId) -> RuntimeStatus;
    fn select_route(&self, context: &ContextSnapshot) -> ModelRoute;
}

#[derive(Debug, thiserror::Error)]
pub enum ModelError {
    #[error("model is not installed: {0:?}")]
    NotInstalled(ModelId),
    #[error("provider does not support model: {0:?}")]
    Unsupported(ModelId),
    #[error("model inference failed: {0}")]
    Inference(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_id_is_string_backed_for_plugin_routes() {
        assert_eq!(ModelId::from("whisper-small-q5").0, "whisper-small-q5");
    }
}
