use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Clone, Default)]
pub struct CancellationToken(std::sync::Arc<AtomicBool>);
impl CancellationToken {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn cancel(&self) {
        self.0.store(true, Ordering::Release);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }
    pub fn flag(&self) -> std::sync::Arc<AtomicBool> {
        std::sync::Arc::clone(&self.0)
    }
}
use crate::{AudioChunk, ContextSnapshot, Transcript};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

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

/// Metadata needed to present and route a downloadable model without coupling
/// the runtime to one model family.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelManifest {
    pub id: ModelId,
    pub display_name: String,
    pub language: String,
    pub backend: String,
    pub quantization: Option<String>,
    pub disk_size_bytes: Option<u64>,
    pub ram_bytes: Option<u64>,
    pub license: ModelLicense,
    /// User/import provenance. Sori never treats a local path as a download URL.
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelLicense {
    pub name: String,
    pub url: Option<String>,
    pub attribution: Option<String>,
}

/// A provider can expose a process invocation while leaving supervision,
/// cancellation, and audio encoding to the host runtime.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalProcessSpec {
    pub executable: PathBuf,
    pub arguments: Vec<String>,
    pub environment: BTreeMap<String, String>,
}

impl ExternalProcessSpec {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
            arguments: Vec::new(),
            environment: BTreeMap::new(),
        }
    }

    pub fn executable_path(&self) -> &Path {
        &self.executable
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeStatus {
    pub model: ModelId,
    pub installed: bool,
    pub loaded: bool,
    pub warm: bool,
    pub memory_bytes: Option<u64>,
    pub backend: Option<String>,
    #[serde(default)]
    pub phase: Option<String>,
    #[serde(default)]
    pub progress_percent: Option<u8>,
    #[serde(default)]
    pub error: Option<String>,
}

/// Registry used by the daemon to compose replaceable providers.
#[derive(Default)]
pub struct ModelProviderRegistry {
    providers: BTreeMap<String, std::sync::Arc<dyn ModelProvider>>,
}

impl ModelProviderRegistry {
    pub fn register(
        &mut self,
        provider: std::sync::Arc<dyn ModelProvider>,
    ) -> Result<(), ModelError> {
        let name = provider.provider_name().to_owned();
        if self.providers.insert(name.clone(), provider).is_some() {
            return Err(ModelError::Inference(format!(
                "model provider already registered: {name}"
            )));
        }
        Ok(())
    }

    pub fn get(&self, name: &str) -> Option<std::sync::Arc<dyn ModelProvider>> {
        self.providers.get(name).cloned()
    }

    pub fn names(&self) -> impl Iterator<Item = &str> {
        self.providers.keys().map(String::as_str)
    }
}

pub trait ModelProvider: Send + Sync {
    fn provider_name(&self) -> &'static str;
    fn manifests(&self) -> Vec<ModelManifest> {
        Vec::new()
    }
    fn can_transcribe(&self, model: &ModelId) -> bool;
    /// Report provider-owned lifecycle state without overstating native inference readiness.
    fn runtime_status(&self, model: &ModelId) -> RuntimeStatus {
        RuntimeStatus {
            model: model.clone(),
            installed: self.can_transcribe(model),
            loaded: false,
            warm: false,
            memory_bytes: None,
            backend: Some(self.provider_name().to_owned()),
            phase: None,
            progress_percent: None,
            error: None,
        }
    }
    fn load(&self, _model: &ModelId) -> Result<(), ModelError> {
        Err(ModelError::Inference(format!(
            "provider {} does not support model loading",
            self.provider_name()
        )))
    }
    fn warm(&self, model: &ModelId) -> Result<(), ModelError> {
        self.load(model)
    }
    fn unload(&self, _model: &ModelId) -> Result<(), ModelError> {
        Err(ModelError::Inference(format!(
            "provider {} does not support model unloading",
            self.provider_name()
        )))
    }
    fn install_model_from_file(
        &self,
        _model: &ModelId,
        _source: &Path,
        _expected_sha256: &str,
    ) -> Result<(), ModelError> {
        Err(ModelError::Inference(format!(
            "provider {} does not support model installation",
            self.provider_name()
        )))
    }
    fn remove_model(&self, _model: &ModelId) -> Result<(), ModelError> {
        Err(ModelError::Inference(format!(
            "provider {} does not support model removal",
            self.provider_name()
        )))
    }
    fn install_model_from_file_cancelled(
        &self,
        model: &ModelId,
        source: &Path,
        expected_sha256: &str,
        cancellation: &CancellationToken,
    ) -> Result<(), ModelError> {
        if cancellation.is_cancelled() {
            return Err(ModelError::Cancelled);
        }
        let result = self.install_model_from_file(model, source, expected_sha256);
        if cancellation.is_cancelled() {
            return Err(ModelError::Cancelled);
        }
        result
    }
    fn remove_model_cancelled(
        &self,
        model: &ModelId,
        cancellation: &CancellationToken,
    ) -> Result<(), ModelError> {
        if cancellation.is_cancelled() {
            return Err(ModelError::Cancelled);
        }
        let result = self.remove_model(model);
        if cancellation.is_cancelled() {
            return Err(ModelError::Cancelled);
        }
        result
    }
    fn transcribe(&self, model: &ModelId, audio: &[AudioChunk]) -> Result<Transcript, ModelError>;
    fn transcribe_with_cancellation(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
        cancellation: &CancellationToken,
    ) -> Result<Transcript, ModelError> {
        if cancellation.is_cancelled() {
            return Err(ModelError::Inference("benchmark cancelled".into()));
        }
        self.transcribe(model, audio)
    }
    fn transcribe_with_context_and_cancellation(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
        vocabulary: &crate::Vocabulary,
        cancellation: &CancellationToken,
    ) -> Result<Transcript, ModelError> {
        if cancellation.is_cancelled() {
            return Err(ModelError::Inference("transcription cancelled".into()));
        }
        self.transcribe_with_context(model, audio, vocabulary)
    }
    fn transcribe_with_context(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
        _vocabulary: &crate::Vocabulary,
    ) -> Result<Transcript, ModelError> {
        self.transcribe(model, audio)
    }
}

pub trait ExternalProcessProvider: ModelProvider {
    fn process_spec(
        &self,
        model: &ModelId,
        input: &Path,
        output: &Path,
    ) -> Result<ExternalProcessSpec, ModelError>;
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
    #[error("model operation cancelled")]
    Cancelled,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_id_is_string_backed_for_plugin_routes() {
        assert_eq!(ModelId::from("whisper-small-q5").0, "whisper-small-q5");
    }

    struct TestProvider;
    impl ModelProvider for TestProvider {
        fn provider_name(&self) -> &'static str {
            "test"
        }
        fn can_transcribe(&self, _: &ModelId) -> bool {
            false
        }
        fn transcribe(&self, _: &ModelId, _: &[AudioChunk]) -> Result<Transcript, ModelError> {
            unreachable!()
        }
    }

    #[test]
    fn provider_registry_rejects_duplicate_names() {
        let mut registry = ModelProviderRegistry::default();
        registry
            .register(std::sync::Arc::new(TestProvider))
            .unwrap();
        assert!(
            registry
                .register(std::sync::Arc::new(TestProvider))
                .is_err()
        );
        assert_eq!(registry.names().collect::<Vec<_>>(), vec!["test"]);
    }
}
