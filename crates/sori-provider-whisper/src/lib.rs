//! whisper.cpp strategy boundary.
//!
//! This crate deliberately has no native dependency. The MVP uses a separately
//! installed whisper.cpp executable; a future FFI adapter can implement the
//! same `sori-core` traits without changing routing or manifests.

use sori_core::{
    AudioChunk, ContextSnapshot, ExternalProcessProvider, ExternalProcessSpec, ModelError, ModelId,
    ModelManifest, ModelProvider, ModelRoute, ModelRuntime, PrivacyMode, RuntimeStatus, Transcript,
};
use std::path::{Path, PathBuf};

pub const PROVIDER_NAME: &str = "whisper.cpp";

#[derive(Debug, Clone)]
pub struct WhisperCppProvider {
    executable: PathBuf,
    manifests: Vec<ModelManifest>,
}

impl WhisperCppProvider {
    pub fn new(executable: impl Into<PathBuf>, manifests: Vec<ModelManifest>) -> Self {
        Self {
            executable: executable.into(),
            manifests,
        }
    }

    pub fn executable(&self) -> &Path {
        &self.executable
    }
}

impl ModelProvider for WhisperCppProvider {
    fn provider_name(&self) -> &'static str {
        PROVIDER_NAME
    }

    fn manifests(&self) -> &[ModelManifest] {
        &self.manifests
    }

    fn can_transcribe(&self, model: &ModelId) -> bool {
        self.manifests.iter().any(|manifest| &manifest.id == model)
    }

    fn transcribe(&self, model: &ModelId, _audio: &[AudioChunk]) -> Result<Transcript, ModelError> {
        if !self.can_transcribe(model) {
            return Err(ModelError::Unsupported(model.clone()));
        }
        Err(ModelError::Inference(
            "whisper.cpp process execution is not wired yet; use process_spec with the host supervisor"
                .to_owned(),
        ))
    }
}

impl ExternalProcessProvider for WhisperCppProvider {
    fn process_spec(
        &self,
        model: &ModelId,
        input: &Path,
        output: &Path,
    ) -> Result<ExternalProcessSpec, ModelError> {
        if !self.can_transcribe(model) {
            return Err(ModelError::Unsupported(model.clone()));
        }
        let mut spec = ExternalProcessSpec::new(self.executable.clone());
        spec.arguments = vec![
            "-m".into(),
            model.0.clone(),
            "-f".into(),
            input.display().to_string(),
            "-otxt".into(),
            "-of".into(),
            output.display().to_string(),
        ];
        Ok(spec)
    }
}

#[derive(Debug, Clone)]
pub struct WhisperRuntime {
    provider: WhisperCppProvider,
    installed: Vec<ModelId>,
}

impl WhisperRuntime {
    pub fn new(provider: WhisperCppProvider, installed: Vec<ModelId>) -> Self {
        Self {
            provider,
            installed,
        }
    }
}

impl ModelRuntime for WhisperRuntime {
    fn status(&self, model: &ModelId) -> RuntimeStatus {
        RuntimeStatus {
            model: model.clone(),
            installed: self.installed.iter().any(|candidate| candidate == model),
            loaded: false,
            warm: false,
            memory_bytes: None,
            backend: Some(PROVIDER_NAME.to_owned()),
        }
    }

    fn select_route(&self, context: &ContextSnapshot) -> ModelRoute {
        let selected = self
            .provider
            .manifests()
            .iter()
            .find(|manifest| self.installed.iter().any(|id| id == &manifest.id))
            .map(|manifest| manifest.id.clone())
            .unwrap_or_else(|| ModelId::from("whisper-unavailable"));
        let reason = match context.privacy {
            PrivacyMode::LocalOnly | PrivacyMode::NeverCloud => "local privacy policy".to_owned(),
            _ => "local whisper.cpp default".to_owned(),
        };
        ModelRoute {
            provider: PROVIDER_NAME.to_owned(),
            model: selected,
            reason,
            fallback: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sori_core::{ModelLicense, ProfileMode};

    fn manifest(id: &str, language: &str) -> ModelManifest {
        ModelManifest {
            id: ModelId::from(id),
            display_name: id.to_owned(),
            language: language.to_owned(),
            backend: "whisper.cpp".to_owned(),
            quantization: Some("q5_1".to_owned()),
            disk_size_bytes: Some(120_000_000),
            ram_bytes: Some(250_000_000),
            license: ModelLicense {
                name: "MIT".to_owned(),
                url: None,
                attribution: None,
            },
        }
    }

    #[test]
    fn manifest_and_process_route_are_provider_specific_but_core_agnostic() {
        let provider = WhisperCppProvider::new("whisper-cli", vec![manifest("small.en", "en")]);
        let spec = provider
            .process_spec(
                &ModelId::from("small.en"),
                Path::new("in.wav"),
                Path::new("out"),
            )
            .expect("known model has a command");
        assert_eq!(spec.executable_path(), Path::new("whisper-cli"));
        assert_eq!(spec.arguments[0], "-m");

        let runtime = WhisperRuntime::new(provider, vec![ModelId::from("small.en")]);
        let route = runtime.select_route(&ContextSnapshot {
            profile: ProfileMode::Coding,
            ..Default::default()
        });
        assert_eq!(route.model, ModelId::from("small.en"));
        assert_eq!(route.provider, PROVIDER_NAME);
    }

    #[test]
    fn missing_model_is_not_selected() {
        let provider = WhisperCppProvider::new("whisper-cli", vec![manifest("small.en", "en")]);
        let route =
            WhisperRuntime::new(provider, Vec::new()).select_route(&ContextSnapshot::default());
        assert_eq!(route.model, ModelId::from("whisper-unavailable"));
    }
}
