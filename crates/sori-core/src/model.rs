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
    fn manifests(&self) -> &[ModelManifest] {
        &[]
    }
    fn can_transcribe(&self, model: &ModelId) -> bool;
    fn transcribe(&self, model: &ModelId, audio: &[AudioChunk]) -> Result<Transcript, ModelError>;
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
