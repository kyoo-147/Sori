//! External whisper.cpp provider boundary.
//!
//! This crate does not link or vendor whisper.cpp. It discovers a separately
//! installed executable, builds safe argument vectors, and parses the files
//! produced by the whisper.cpp CLI.
//! produced by the whisper.cpp CLI.

use sha2::Digest;

use serde_json::Value;
use sori_core::{
    AudioChunk, CancellationToken, ContextSnapshot, ExternalProcessProvider, ExternalProcessSpec,
    ModelError, ModelId, ModelManifest, ModelProvider, ModelRoute, ModelRuntime, PrivacyMode,
    RuntimeStatus, SampleFormat, Transcript, TranscriptSegment,
};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration as StdDuration;
use time::Duration;

pub const PROVIDER_NAME: &str = "whisper.cpp";

/// Truthful lifecycle for the external whisper.cpp sidecar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WhisperLifecycle {
    Unavailable,
    Downloading,
    Loading,
    Ready,
    Running,
    Failed,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WhisperStatus {
    pub model: ModelId,
    pub lifecycle: WhisperLifecycle,
    pub model_path: Option<PathBuf>,
    pub latency_ms: Option<f64>,
    pub error: Option<String>,
    pub progress_percent: Option<u8>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TranscriptionResult {
    pub transcript: Transcript,
    pub latency_ms: f64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WhisperCppConfig {
    pub executable: PathBuf,
    pub model_dir: Option<PathBuf>,
}

#[derive(Debug, Default)]
struct WhisperFileConfig {
    executable: Option<PathBuf>,
    model_dir: Option<PathBuf>,
}

fn default_config_path() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(|root| PathBuf::from(root).join("Sori").join("whisper.json"))
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
            .map(|root| root.join("sori").join("whisper.json"))
    }
}

fn load_file_config() -> Result<Option<WhisperFileConfig>, ModelError> {
    let explicit = std::env::var_os("SORI_WHISPER_CONFIG").is_some();
    let path = std::env::var_os("SORI_WHISPER_CONFIG")
        .map(PathBuf::from)
        .or_else(default_config_path);
    let Some(path) = path else { return Ok(None) };
    if !path.exists() {
        return if explicit {
            Err(ModelError::Inference(format!(
                "Sori Whisper config does not exist: {}",
                path.display()
            )))
        } else {
            Ok(None)
        };
    }
    let text = fs::read_to_string(&path).map_err(|error| {
        ModelError::Inference(format!(
            "could not read Sori Whisper config ({}): {error}",
            path.display()
        ))
    })?;
    let value: Value = serde_json::from_str(&text).map_err(|error| {
        ModelError::Inference(format!(
            "invalid Sori Whisper config ({}): {error}",
            path.display()
        ))
    })?;
    let path_field = |key: &str| -> Result<Option<PathBuf>, ModelError> {
        match value.get(key) {
            None => Ok(None),
            Some(Value::String(value)) if !value.trim().is_empty() => {
                Ok(Some(PathBuf::from(value)))
            }
            Some(_) => Err(ModelError::Inference(format!(
                "Sori Whisper config field `{key}` must be a non-empty string"
            ))),
        }
    };
    Ok(Some(WhisperFileConfig {
        executable: path_field("executable")?,
        model_dir: path_field("model_dir")?,
    }))
}

impl WhisperCppConfig {
    /// Discover environment overrides, then restart-persistent Sori config, then PATH.
    pub fn discover() -> Result<Self, ModelError> {
        let file_config = load_file_config()?;
        let executable = std::env::var_os("SORI_WHISPER_CPP_BIN")
            .or_else(|| std::env::var_os("WHISPER_CPP_BIN"))
            .map(PathBuf::from)
            .or_else(|| file_config.as_ref().and_then(|config| config.executable.clone()))
            .or_else(|| find_on_path(if cfg!(windows) { "whisper-cli.exe" } else { "whisper-cli" }))
            .or_else(|| find_on_path(if cfg!(windows) { "main.exe" } else { "main" }))
            .ok_or_else(|| ModelError::Inference("whisper.cpp executable was not found; set SORI_WHISPER_CPP_BIN or configure Sori's whisper.json".into()))?;
        if !executable.is_file() {
            return Err(ModelError::Inference(format!(
                "whisper.cpp executable does not exist: {}",
                executable.display()
            )));
        }
        let model_dir = std::env::var_os("SORI_WHISPER_MODEL_DIR")
            .or_else(|| std::env::var_os("WHISPER_CPP_MODEL_DIR"))
            .map(PathBuf::from)
            .or_else(|| file_config.and_then(|config| config.model_dir));
        if let Some(dir) = &model_dir {
            if !dir.is_dir() {
                return Err(ModelError::Inference(format!(
                    "whisper.cpp model directory does not exist: {}",
                    dir.display()
                )));
            }
        }
        Ok(Self {
            executable,
            model_dir,
        })
    }

    /// Persist user-owned runtime paths for the next daemon start. Sori never
    /// downloads or bundles the executable; this only writes configuration.
    pub fn persist_config(
        executable: &Path,
        model_dir: Option<&Path>,
    ) -> Result<PathBuf, ModelError> {
        let path = std::env::var_os("SORI_WHISPER_CONFIG")
            .map(PathBuf::from)
            .or_else(default_config_path)
            .ok_or_else(|| {
                ModelError::Inference("Sori Whisper config path is unavailable".into())
            })?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                ModelError::Inference(format!("could not create Sori config directory: {error}"))
            })?;
        }
        let value = serde_json::json!({ "executable": executable, "model_dir": model_dir });
        fs::write(
            &path,
            serde_json::to_vec_pretty(&value).map_err(|error| {
                ModelError::Inference(format!("could not encode Sori Whisper config: {error}"))
            })?,
        )
        .map_err(|error| {
            ModelError::Inference(format!(
                "could not persist Sori Whisper config ({}): {error}",
                path.display()
            ))
        })?;
        Ok(path)
    }

    pub fn new(executable: impl Into<PathBuf>, model_dir: Option<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
            model_dir,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Text,
    Json,
    Srt,
}

impl OutputFormat {
    fn arguments(self) -> (&'static str, &'static str) {
        match self {
            Self::Text => ("-otxt", "txt"),
            Self::Json => ("-oj", "json"),
            Self::Srt => ("-osrt", "srt"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct WhisperCppProvider {
    executable: PathBuf,
    model_dir: Option<PathBuf>,
    manifests: Arc<Mutex<Vec<ModelManifest>>>,
    status: Arc<Mutex<WhisperStatus>>,
    loaded: Arc<Mutex<BTreeSet<ModelId>>>,
    warm: Arc<Mutex<BTreeSet<ModelId>>>,
}

fn initial_status() -> Arc<Mutex<WhisperStatus>> {
    Arc::new(Mutex::new(WhisperStatus {
        model: ModelId::from(""),
        lifecycle: WhisperLifecycle::Unavailable,
        model_path: None,
        latency_ms: None,
        error: None,
        progress_percent: None,
    }))
}

impl WhisperCppProvider {
    /// Compatibility constructor for callers that already resolved a binary.
    pub fn new(executable: impl Into<PathBuf>, manifests: Vec<ModelManifest>) -> Self {
        Self {
            executable: executable.into(),
            model_dir: None,
            manifests: Arc::new(Mutex::new(manifests)),
            status: initial_status(),
            loaded: Arc::new(Mutex::new(BTreeSet::new())),
            warm: Arc::new(Mutex::new(BTreeSet::new())),
        }
    }

    pub fn from_config(config: WhisperCppConfig, manifests: Vec<ModelManifest>) -> Self {
        Self {
            executable: config.executable,
            model_dir: config.model_dir,
            manifests: Arc::new(Mutex::new(manifests)),
            status: initial_status(),
            loaded: Arc::new(Mutex::new(BTreeSet::new())),
            warm: Arc::new(Mutex::new(BTreeSet::new())),
        }
    }

    pub fn executable(&self) -> &Path {
        &self.executable
    }
    pub fn model_dir(&self) -> Option<&Path> {
        self.model_dir.as_deref()
    }

    pub fn remove_model(&self, model: &ModelId) -> Result<(), ModelError> {
        self.validate_model_name(model)?;
        let path = self.verified_model_path(model)?;
        fs::remove_file(&path).map_err(|error| {
            ModelError::Inference(format!(
                "could not remove model {}: {error}",
                path.display()
            ))
        })?;
        self.loaded.lock().unwrap().remove(model);
        self.warm.lock().unwrap().remove(model);
        self.manifests
            .lock()
            .unwrap()
            .retain(|manifest| &manifest.id != model);
        Ok(())
    }

    pub fn load(&self, model: &ModelId) -> Result<(), ModelError> {
        self.validate_for_transcription(model)?;
        self.loaded.lock().unwrap().insert(model.clone());
        Ok(())
    }

    pub fn warm(&self, model: &ModelId) -> Result<(), ModelError> {
        self.load(model)?;
        self.warm.lock().unwrap().insert(model.clone());
        Ok(())
    }

    pub fn unload(&self, model: &ModelId) {
        self.warm.lock().unwrap().remove(model);
        self.loaded.lock().unwrap().remove(model);
    }

    pub fn is_loaded(&self, model: &ModelId) -> bool {
        self.loaded.lock().unwrap().contains(model)
    }
    pub fn is_warm(&self, model: &ModelId) -> bool {
        self.warm.lock().unwrap().contains(model)
    }

    /// Install a checked model artifact inside the configured model directory.
    /// URL fetching stays outside the provider; callers must supply the artifact
    /// and, for reproducibility, its expected SHA-256.
    pub fn install_model_from_file(
        &self,
        model: &ModelId,
        source: &Path,
        expected_sha256: Option<&str>,
    ) -> Result<PathBuf, ModelError> {
        self.validate_model_name(model)?;
        let root = self.model_dir.as_ref().ok_or_else(|| {
            ModelError::Inference(
                "cannot install a model without a configured model directory".into(),
            )
        })?;
        if !source.is_file() {
            return Err(ModelError::Inference(format!(
                "model artifact does not exist: {}",
                source.display()
            )));
        }
        if let Ok(mut status) = self.status.lock() {
            status.model = model.clone();
            status.lifecycle = WhisperLifecycle::Downloading;
            status.progress_percent = Some(0);
            status.error = None;
        }
        let result = (|| {
            let bytes = fs::read(source).map_err(|e| {
                ModelError::Inference(format!("could not read model artifact: {e}"))
            })?;
            if let Some(expected) = expected_sha256 {
                let actual = format!("{:x}", sha2::Sha256::digest(&bytes));
                if !actual.eq_ignore_ascii_case(expected.trim()) {
                    return Err(ModelError::Inference(format!(
                        "model checksum mismatch: expected {expected}, got {actual}"
                    )));
                }
            }
            fs::create_dir_all(root).map_err(|e| {
                ModelError::Inference(format!("could not create model directory: {e}"))
            })?;
            let destination = root.join(&model.0);
            let temporary = destination.with_extension("download");
            fs::write(&temporary, bytes).map_err(|e| {
                ModelError::Inference(format!("could not write model artifact: {e}"))
            })?;
            fs::rename(&temporary, &destination).map_err(|e| {
                ModelError::Inference(format!("could not install model atomically: {e}"))
            })?;
            Ok(destination)
        })();
        match result {
            Ok(path) => {
                let discovered = self.discover_models()?;
                if !discovered.iter().any(|manifest| manifest.id == *model) {
                    return Err(ModelError::Inference(format!(
                        "installed artifact is not a discoverable whisper.cpp model: {}",
                        model.0
                    )));
                }
                let mut manifests = self.manifests.lock().unwrap();
                *manifests = discovered;
                if let Ok(mut status) = self.status.lock() {
                    status.lifecycle = WhisperLifecycle::Ready;
                    status.model_path = Some(path.clone());
                    status.progress_percent = Some(100);
                }
                Ok(path)
            }
            Err(error) => {
                if let Ok(mut status) = self.status.lock() {
                    status.lifecycle = WhisperLifecycle::Failed;
                    status.error = Some(error.to_string());
                    status.progress_percent = None;
                }
                Err(error)
            }
        }
    }

    fn validate_model_name(&self, model: &ModelId) -> Result<(), ModelError> {
        let candidate = Path::new(&model.0);
        if model.0.is_empty()
            || candidate.is_absolute()
            || candidate.components().any(|c| {
                matches!(
                    c,
                    std::path::Component::ParentDir | std::path::Component::Prefix(_)
                )
            })
        {
            return Err(ModelError::Inference(format!(
                "invalid whisper.cpp model path: {}",
                model.0
            )));
        }
        Ok(())
    }

    /// Validate everything required before launching the native sidecar.
    pub fn validate_for_transcription(&self, model: &ModelId) -> Result<(), ModelError> {
        if !self.executable.is_file() {
            return Err(ModelError::Inference(format!(
                "whisper.cpp executable does not exist: {}",
                self.executable.display()
            )));
        }
        self.verified_model_path(model)?;
        Ok(())
    }

    pub fn model_path(&self, model: &ModelId) -> PathBuf {
        self.model_dir
            .as_ref()
            .map(|dir| dir.join(&model.0))
            .unwrap_or_else(|| PathBuf::from(&model.0))
    }

    /// Resolve a model only if it stays inside the configured model directory.
    pub fn verified_model_path(&self, model: &ModelId) -> Result<PathBuf, ModelError> {
        let candidate = Path::new(&model.0);
        if model.0.is_empty()
            || candidate.is_absolute()
            || candidate.components().any(|c| {
                matches!(
                    c,
                    std::path::Component::ParentDir | std::path::Component::Prefix(_)
                )
            })
        {
            return Err(ModelError::Inference(format!(
                "invalid whisper.cpp model path: {}",
                model.0
            )));
        }
        let path = self.model_path(model);
        if let Some(dir) = &self.model_dir {
            let root = fs::canonicalize(dir).map_err(|e| {
                ModelError::Inference(format!(
                    "whisper.cpp model directory is unavailable ({}): {e}",
                    dir.display()
                ))
            })?;
            let file = fs::canonicalize(&path).map_err(|e| {
                ModelError::Inference(format!(
                    "whisper.cpp model file does not exist ({}): {e}",
                    path.display()
                ))
            })?;
            if !file.starts_with(&root) {
                return Err(ModelError::Inference(
                    "whisper.cpp model path escapes model directory".into(),
                ));
            }
            Ok(file)
        } else if path.is_file() {
            fs::canonicalize(&path).map_err(|e| {
                ModelError::Inference(format!("could not verify whisper.cpp model path: {e}"))
            })
        } else {
            Err(ModelError::Inference(format!(
                "whisper.cpp model file does not exist: {}",
                path.display()
            )))
        }
    }

    pub fn status(&self, model: &ModelId) -> WhisperStatus {
        let mut status = self
            .status
            .lock()
            .expect("whisper status lock poisoned")
            .clone();
        status.model = model.clone();
        status.model_path = self.verified_model_path(model).ok();
        if status.error.is_none()
            && status.model_path.is_some()
            && matches!(
                status.lifecycle,
                WhisperLifecycle::Unavailable | WhisperLifecycle::Ready
            )
        {
            status.lifecycle = WhisperLifecycle::Ready;
        } else if status.error.is_none()
            && matches!(status.lifecycle, WhisperLifecycle::Unavailable)
        {
            status.lifecycle = WhisperLifecycle::Unavailable;
        }
        status
    }

    /// Discover real model files; no manifest is emitted for a missing file.
    pub fn discover_models(&self) -> Result<Vec<ModelManifest>, ModelError> {
        let dir = self.model_dir.as_ref().ok_or_else(|| {
            ModelError::Inference("whisper.cpp model directory is not configured".into())
        })?;
        let mut models = Vec::new();
        for entry in fs::read_dir(dir).map_err(|e| {
            ModelError::Inference(format!(
                "could not scan whisper.cpp model directory ({}): {e}",
                dir.display()
            ))
        })? {
            let path = entry
                .map_err(|e| {
                    ModelError::Inference(format!(
                        "could not inspect whisper.cpp model directory: {e}"
                    ))
                })?
                .path();
            if path.is_file() && path.extension().is_some_and(|ext| ext == "bin") {
                let id = path.file_name().unwrap().to_string_lossy().into_owned();
                let size = fs::metadata(&path).ok().map(|m| m.len());
                models.push(ModelManifest {
                    id: ModelId::from(id.as_str()),
                    display_name: id,
                    language: "unknown".into(),
                    backend: PROVIDER_NAME.into(),
                    quantization: None,
                    disk_size_bytes: size,
                    ram_bytes: None,
                    license: sori_core::ModelLicense {
                        name: "whisper.cpp model license".into(),
                        url: None,
                        attribution: None,
                    },
                });
            }
        }
        models.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(models)
    }
    pub fn process_spec_with_format(
        &self,
        model: &ModelId,
        input: &Path,
        output: &Path,
        format: OutputFormat,
    ) -> Result<ExternalProcessSpec, ModelError> {
        if !self.can_transcribe(model) {
            return Err(ModelError::Unsupported(model.clone()));
        }
        let model_path = if self.model_dir.is_some() {
            self.verified_model_path(model)?;
            self.model_path(model)
        } else {
            self.model_path(model)
        };
        let candidate = Path::new(&model.0);
        if candidate.is_absolute()
            || candidate.components().any(|c| {
                matches!(
                    c,
                    std::path::Component::ParentDir | std::path::Component::Prefix(_)
                )
            })
        {
            return Err(ModelError::Inference(format!(
                "invalid whisper.cpp model path: {}",
                model.0
            )));
        }
        let (flag, _) = format.arguments();
        let mut spec = ExternalProcessSpec::new(self.executable.clone());
        spec.arguments = vec![
            "-m".into(),
            model_path.display().to_string(),
            "-f".into(),
            input.display().to_string(),
            flag.into(),
            "-of".into(),
            output.display().to_string(),
        ];
        Ok(spec)
    }

    pub fn transcribe_with_runner<R: ProcessRunner>(
        &self,
        model: &ModelId,
        input: &Path,
        output: &Path,
        format: OutputFormat,
        runner: &R,
    ) -> Result<Transcript, ModelError> {
        self.transcribe_with_runner_options(
            model,
            input,
            output,
            format,
            runner,
            &ProcessOptions::default(),
        )
    }

    /// Encode captured PCM and run the configured whisper.cpp binary.
    pub fn transcribe_audio(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
        format: OutputFormat,
        options: &ProcessOptions,
    ) -> Result<Transcript, ModelError> {
        self.validate_for_transcription(model)?;
        self.transcribe_audio_with_runner_options(
            model,
            audio,
            format,
            &CommandProcessRunner,
            options,
        )
    }

    /// Encode captured PCM and run whisper.cpp through the supplied supervisor.
    /// The input and output files are always removed before returning.
    pub fn transcribe_audio_with_runner<R: ProcessRunner>(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
        format: OutputFormat,
        runner: &R,
    ) -> Result<Transcript, ModelError> {
        self.transcribe_audio_with_runner_options(
            model,
            audio,
            format,
            runner,
            &ProcessOptions::default(),
        )
    }

    pub fn transcribe_audio_with_runner_options<R: ProcessRunner>(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
        format: OutputFormat,
        runner: &R,
        options: &ProcessOptions,
    ) -> Result<Transcript, ModelError> {
        Ok(self
            .transcribe_audio_with_runner_options_timed(model, audio, format, runner, options)?
            .transcript)
    }

    pub fn transcribe_audio_with_runner_options_timed<R: ProcessRunner>(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
        format: OutputFormat,
        runner: &R,
        options: &ProcessOptions,
    ) -> Result<TranscriptionResult, ModelError> {
        let started = std::time::Instant::now();
        if let Ok(mut status) = self.status.lock() {
            status.model = model.clone();
            status.lifecycle = WhisperLifecycle::Loading;
            status.error = None;
        }
        if let Ok(mut status) = self.status.lock() {
            status.lifecycle = WhisperLifecycle::Running;
        }
        let base = unique_temp_path("sori-whisper");
        let input = base.with_extension("wav");
        let output = base.clone();
        let result = encode_wav(audio).and_then(|wav| {
            fs::write(&input, wav).map_err(|error| {
                ModelError::Inference(format!(
                    "could not write whisper input WAV ({}): {error}",
                    input.display()
                ))
            })?;
            self.transcribe_with_runner_options(model, &input, &output, format, runner, options)
        });
        let cleanup = remove_paths([
            input.as_path(),
            output.as_path(),
            output_with_extension(&output, format.arguments().1).as_path(),
        ]);
        match (result, cleanup) {
            (Err(error), Ok(())) => {
                if let Ok(mut status) = self.status.lock() {
                    status.lifecycle = WhisperLifecycle::Failed;
                    status.error = Some(error.to_string());
                }
                Err(error)
            }
            (Err(error), Err(cleanup)) => Err(ModelError::Inference(format!(
                "{error}; temporary-file cleanup also failed: {cleanup}"
            ))),
            (Ok(_), Err(error)) => Err(error),
            (Ok(transcript), Ok(())) => {
                let latency_ms = started.elapsed().as_secs_f64() * 1000.0;
                if let Ok(mut status) = self.status.lock() {
                    status.lifecycle = WhisperLifecycle::Ready;
                    status.latency_ms = Some(latency_ms);
                    status.error = None;
                }
                Ok(TranscriptionResult {
                    transcript,
                    latency_ms,
                })
            }
        }
    }

    fn transcribe_with_runner_options<R: ProcessRunner>(
        &self,
        model: &ModelId,
        input: &Path,
        output: &Path,
        format: OutputFormat,
        runner: &R,
        options: &ProcessOptions,
    ) -> Result<Transcript, ModelError> {
        let spec = self.process_spec_with_format(model, input, output, format)?;
        let result = runner.run_with_options(&spec, options)?;
        if !result.status.success() {
            return Err(ModelError::Inference(if result.stderr.is_empty() {
                format!("whisper.cpp exited unsuccessfully ({:?})", result.status)
            } else {
                format!(
                    "whisper.cpp exited unsuccessfully: {}",
                    result.stderr.trim()
                )
            }));
        }
        let actual = output_with_extension(output, format.arguments().1);
        match fs::read_to_string(&actual) {
            Ok(content) => parse_transcript(&content, format),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                // Compatible whisper.cpp builds may emit the selected format
                // to stdout even when they accept -of. Accept that real
                // process output only when the output file is absent.
                if !result.stdout.trim().is_empty() {
                    parse_transcript(&result.stdout, format)
                } else {
                    Err(ModelError::Inference(format!(
                        "whisper.cpp output was not produced ({}): {}",
                        actual.display(),
                        error
                    )))
                }
            }
            Err(error) => Err(ModelError::Inference(format!(
                "whisper.cpp output could not be read ({}): {error}",
                actual.display()
            ))),
        }
    }
}

fn output_with_extension(path: &Path, extension: &str) -> PathBuf {
    if path.extension().is_some() {
        path.to_path_buf()
    } else {
        path.with_extension(extension)
    }
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    std::env::var_os("PATH")?
        .to_string_lossy()
        .split(if cfg!(windows) { ';' } else { ':' })
        .map(PathBuf::from)
        .map(|dir| dir.join(name))
        .find(|path| path.is_file())
}

#[derive(Debug)]
pub struct ProcessOutput {
    pub status: ExitStatus,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone)]
pub struct ProcessOptions {
    pub timeout: Option<StdDuration>,
    pub cancelled: Arc<AtomicBool>,
}

impl Default for ProcessOptions {
    fn default() -> Self {
        Self {
            timeout: None,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl ProcessOptions {
    pub fn cancelled() -> Self {
        let options = Self::default();
        options.cancelled.store(true, Ordering::Relaxed);
        options
    }
}

pub trait ProcessRunner {
    fn run(&self, spec: &ExternalProcessSpec) -> Result<ProcessOutput, ModelError>;

    /// The host supervisor may override this to enforce timeout and cancellation
    /// while the child is running. The default preserves existing fake runners.
    fn run_with_options(
        &self,
        spec: &ExternalProcessSpec,
        options: &ProcessOptions,
    ) -> Result<ProcessOutput, ModelError> {
        if options.cancelled.load(Ordering::Relaxed) {
            return Err(ModelError::Inference(
                "whisper.cpp process cancelled before launch".into(),
            ));
        }
        if options.timeout.is_some_and(|timeout| timeout.is_zero()) {
            return Err(ModelError::Inference(
                "whisper.cpp process timed out before launch".into(),
            ));
        }
        self.run(spec)
    }
}

/// The production runner for the sidecar boundary. Arguments are passed to
/// `Command` directly; no shell parsing or interpolation is involved.
#[derive(Debug, Default, Clone, Copy)]
pub struct CommandProcessRunner;

impl ProcessRunner for CommandProcessRunner {
    fn run(&self, spec: &ExternalProcessSpec) -> Result<ProcessOutput, ModelError> {
        self.run_with_options(spec, &ProcessOptions::default())
    }

    fn run_with_options(
        &self,
        spec: &ExternalProcessSpec,
        options: &ProcessOptions,
    ) -> Result<ProcessOutput, ModelError> {
        if options.cancelled.load(Ordering::Relaxed) {
            return Err(ModelError::Inference(
                "whisper.cpp process cancelled before launch".into(),
            ));
        }
        if options.timeout.is_some_and(|timeout| timeout.is_zero()) {
            return Err(ModelError::Inference(
                "whisper.cpp process timed out before launch".into(),
            ));
        }
        let mut command = Command::new(&spec.executable);
        command
            .args(&spec.arguments)
            .envs(spec.environment.iter())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command.spawn().map_err(|error| {
            ModelError::Inference(format!(
                "could not launch whisper.cpp ({}): {error}",
                spec.executable.display()
            ))
        })?;
        // Drain both pipes immediately so verbose native builds cannot deadlock.
        let stdout = child.stdout.take().ok_or_else(|| {
            ModelError::Inference("whisper.cpp stdout pipe was unavailable".into())
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            ModelError::Inference("whisper.cpp stderr pipe was unavailable".into())
        })?;
        let stdout_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            std::io::Read::read_to_end(&mut std::io::BufReader::new(stdout), &mut bytes)
                .map(|_| bytes)
        });
        let stderr_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            std::io::Read::read_to_end(&mut std::io::BufReader::new(stderr), &mut bytes)
                .map(|_| bytes)
        });
        let started = std::time::Instant::now();
        loop {
            if options.cancelled.load(Ordering::Relaxed) {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(ModelError::Inference(
                    "whisper.cpp process cancelled".into(),
                ));
            }
            if let Some(timeout) = options.timeout {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_reader.join();
                    let _ = stderr_reader.join();
                    return Err(ModelError::Inference(format!(
                        "whisper.cpp process timed out after {timeout:?}"
                    )));
                }
            }
            if child
                .try_wait()
                .map_err(|error| {
                    ModelError::Inference(format!("could not supervise whisper.cpp: {error}"))
                })?
                .is_some()
            {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let status = child.wait().map_err(|error| {
            ModelError::Inference(format!("could not collect whisper.cpp status: {error}"))
        })?;
        let stdout = stdout_reader
            .join()
            .map_err(|_| ModelError::Inference("could not collect whisper.cpp stdout".into()))?
            .map_err(|error| {
                ModelError::Inference(format!("could not read whisper.cpp stdout: {error}"))
            })?;
        let stderr = stderr_reader
            .join()
            .map_err(|_| ModelError::Inference("could not collect whisper.cpp stderr".into()))?
            .map_err(|error| {
                ModelError::Inference(format!("could not read whisper.cpp stderr: {error}"))
            })?;
        Ok(ProcessOutput {
            status,
            stdout: String::from_utf8_lossy(&stdout).into_owned(),
            stderr: String::from_utf8_lossy(&stderr).into_owned(),
        })
    }
}

/// Convert the provider's f32 sample contract to canonical mono/stereo PCM16 WAV.
/// Samples are interleaved when the chunk has more than one channel.
pub fn encode_wav(chunks: &[AudioChunk]) -> Result<Vec<u8>, ModelError> {
    let first = chunks
        .first()
        .ok_or_else(|| ModelError::Inference("cannot transcribe empty audio".into()))?;
    let format = &first.format;
    if format.sample_rate_hz == 0 || format.channels == 0 {
        return Err(ModelError::Inference(
            "audio has an invalid sample rate or channel count".into(),
        ));
    }
    if !matches!(format.sample_format, SampleFormat::I16 | SampleFormat::F32) {
        return Err(ModelError::Inference(
            "audio sample format is unsupported".into(),
        ));
    }
    let mut pcm = Vec::new();
    for chunk in chunks {
        if chunk.format != *format {
            return Err(ModelError::Inference(
                "audio chunks have inconsistent formats".into(),
            ));
        }
        for sample in &chunk.samples {
            let sample = if sample.is_finite() {
                sample.clamp(-1.0, 1.0)
            } else {
                0.0
            };
            let value = if sample <= -1.0 {
                i16::MIN
            } else {
                (sample * i16::MAX as f32).round() as i16
            };
            pcm.extend_from_slice(&value.to_le_bytes());
        }
    }
    let data_len = u32::try_from(pcm.len())
        .map_err(|_| ModelError::Inference("audio is too large for a WAV file".into()))?;
    let riff_len = 36u32
        .checked_add(data_len)
        .ok_or_else(|| ModelError::Inference("audio is too large for a WAV file".into()))?;
    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&riff_len.to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&format.channels.to_le_bytes());
    wav.extend_from_slice(&format.sample_rate_hz.to_le_bytes());
    let byte_rate = format.sample_rate_hz * u32::from(format.channels) * 2;
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&(format.channels * 2).to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(&pcm);
    Ok(wav)
}

fn unique_temp_path(prefix: &str) -> PathBuf {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("{prefix}-{}-{id}", std::process::id()))
}

fn remove_paths<'a, I>(paths: I) -> Result<(), ModelError>
where
    I: IntoIterator<Item = &'a Path>,
{
    let mut failure = None;
    for path in paths {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                failure = Some(format!(
                    "could not clean up temporary file {}: {error}",
                    path.display()
                ))
            }
        }
    }
    failure.map_or(Ok(()), |error| Err(ModelError::Inference(error)))
}

struct VocabularyPromptRunner<'a> {
    prompt: &'a str,
}
impl ProcessRunner for VocabularyPromptRunner<'_> {
    fn run(&self, spec: &ExternalProcessSpec) -> Result<ProcessOutput, ModelError> {
        let mut prompted = spec.clone();
        if !self.prompt.trim().is_empty() {
            prompted
                .arguments
                .extend(["--prompt".into(), self.prompt.to_owned()]);
        }
        CommandProcessRunner.run(&prompted)
    }
}
impl ModelProvider for WhisperCppProvider {
    fn provider_name(&self) -> &'static str {
        PROVIDER_NAME
    }
    fn manifests(&self) -> Vec<ModelManifest> {
        self.manifests.lock().unwrap().clone()
    }
    fn can_transcribe(&self, model: &ModelId) -> bool {
        self.manifests
            .lock()
            .unwrap()
            .iter()
            .any(|manifest| &manifest.id == model)
            || self.verified_model_path(model).is_ok()
    }
    fn runtime_status(&self, model: &ModelId) -> RuntimeStatus {
        let status = self.status(model);
        RuntimeStatus {
            model: model.clone(),
            installed: status.model_path.is_some(),
            loaded: self.is_loaded(model),
            warm: self.is_warm(model),
            memory_bytes: None,
            backend: Some(PROVIDER_NAME.into()),
            phase: Some(format!("{:?}", status.lifecycle)),
            progress_percent: status.progress_percent,
            error: status.error.clone(),
        }
    }
    fn load(&self, model: &ModelId) -> Result<(), ModelError> {
        WhisperCppProvider::load(self, model)
    }
    fn warm(&self, model: &ModelId) -> Result<(), ModelError> {
        WhisperCppProvider::warm(self, model)
    }
    fn unload(&self, model: &ModelId) -> Result<(), ModelError> {
        self.unload(model);
        Ok(())
    }
    fn install_model_from_file(
        &self,
        model: &ModelId,
        source: &Path,
        expected_sha256: &str,
    ) -> Result<(), ModelError> {
        if expected_sha256.trim().len() != 64
            || !expected_sha256
                .trim()
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(ModelError::Inference(
                "model checksum must be a 64-character SHA-256 hex digest".into(),
            ));
        }
        WhisperCppProvider::install_model_from_file(self, model, source, Some(expected_sha256))?;
        Ok(())
    }
    fn remove_model(&self, model: &ModelId) -> Result<(), ModelError> {
        WhisperCppProvider::remove_model(self, model)
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
        self.install_model_from_file(model, source, Some(expected_sha256))?;
        if cancellation.is_cancelled() {
            let _ = self.remove_model(model);
            return Err(ModelError::Cancelled);
        }
        Ok(())
    }
    fn transcribe(&self, model: &ModelId, audio: &[AudioChunk]) -> Result<Transcript, ModelError> {
        if !self.can_transcribe(model) {
            return Err(ModelError::Unsupported(model.clone()));
        }
        self.transcribe_audio(model, audio, OutputFormat::Text, &ProcessOptions::default())
    }
    fn transcribe_with_cancellation(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
        cancellation: &CancellationToken,
    ) -> Result<Transcript, ModelError> {
        if !self.can_transcribe(model) {
            return Err(ModelError::Unsupported(model.clone()));
        }
        let options = ProcessOptions {
            timeout: None,
            cancelled: cancellation.flag(),
        };
        self.transcribe_audio(model, audio, OutputFormat::Text, &options)
    }
    fn transcribe_with_context_and_cancellation(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
        vocabulary: &sori_core::Vocabulary,
        cancellation: &CancellationToken,
    ) -> Result<Transcript, ModelError> {
        if !self.can_transcribe(model) {
            return Err(ModelError::Unsupported(model.clone()));
        }
        let prompt = vocabulary.prompt();
        let options = ProcessOptions {
            timeout: None,
            cancelled: cancellation.flag(),
        };
        self.transcribe_audio_with_runner_options(
            model,
            audio,
            OutputFormat::Text,
            &VocabularyPromptRunner { prompt: &prompt },
            &options,
        )
    }
    fn transcribe_with_context(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
        vocabulary: &sori_core::Vocabulary,
    ) -> Result<Transcript, ModelError> {
        if !self.can_transcribe(model) {
            return Err(ModelError::Unsupported(model.clone()));
        }
        let prompt = vocabulary.prompt();
        self.transcribe_audio_with_runner_options(
            model,
            audio,
            OutputFormat::Text,
            &VocabularyPromptRunner { prompt: &prompt },
            &ProcessOptions::default(),
        )
    }
}

impl ExternalProcessProvider for WhisperCppProvider {
    fn process_spec(
        &self,
        model: &ModelId,
        input: &Path,
        output: &Path,
    ) -> Result<ExternalProcessSpec, ModelError> {
        self.process_spec_with_format(model, input, output, OutputFormat::Text)
    }
}

/// Parse text, whisper.cpp JSON, or SRT output without depending on a process.
pub fn parse_transcript(content: &str, format: OutputFormat) -> Result<Transcript, ModelError> {
    match format {
        OutputFormat::Text => {
            let text = content.trim();
            if text.is_empty() {
                return Err(ModelError::Inference(
                    "whisper.cpp returned empty transcript".into(),
                ));
            }
            Ok(Transcript::plain(text))
        }
        OutputFormat::Json => parse_json(content),
        OutputFormat::Srt => parse_srt(content),
    }
}

fn parse_json(content: &str) -> Result<Transcript, ModelError> {
    let value: Value = serde_json::from_str(content)
        .map_err(|e| ModelError::Inference(format!("invalid whisper.cpp JSON: {e}")))?;
    let entries = value
        .get("transcription")
        .or_else(|| value.get("segments"))
        .and_then(Value::as_array)
        .ok_or_else(|| {
            ModelError::Inference("whisper.cpp JSON has no transcription segments".into())
        })?;
    let mut segments = Vec::new();
    for entry in entries {
        let text = entry
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_owned();
        if text.is_empty() {
            continue;
        }
        let start = entry
            .get("offsets")
            .and_then(|v| v.get("from"))
            .and_then(Value::as_i64)
            .or_else(|| {
                entry
                    .get("timestamps")
                    .and_then(|v| v.get("from"))
                    .and_then(Value::as_i64)
            })
            .unwrap_or(0);
        let end = entry
            .get("offsets")
            .and_then(|v| v.get("to"))
            .and_then(Value::as_i64)
            .or_else(|| {
                entry
                    .get("timestamps")
                    .and_then(|v| v.get("to"))
                    .and_then(Value::as_i64)
            })
            .unwrap_or(start);
        segments.push(TranscriptSegment {
            text,
            start: Duration::milliseconds(start),
            end: Duration::milliseconds(end),
            confidence: None,
            speaker: None,
        });
    }
    if segments.is_empty() {
        return Err(ModelError::Inference(
            "whisper.cpp JSON transcript has no text".into(),
        ));
    }
    Ok(Transcript {
        language: value
            .get("language")
            .and_then(Value::as_str)
            .map(str::to_owned),
        text: segments
            .iter()
            .map(|s| s.text.as_str())
            .collect::<Vec<_>>()
            .join(" "),
        segments,
    })
}

fn parse_srt(content: &str) -> Result<Transcript, ModelError> {
    let mut segments = Vec::new();
    for block in content.split("\n\n") {
        let mut lines = block.lines();
        let _number = lines.next();
        let timing = lines
            .next()
            .ok_or_else(|| ModelError::Inference("invalid whisper.cpp SRT output".into()))?
            .trim();
        let (from, to) = timing
            .split_once(" --> ")
            .ok_or_else(|| ModelError::Inference("invalid whisper.cpp SRT timing".into()))?;
        let text = lines.collect::<Vec<_>>().join(" ").trim().to_owned();
        if !text.is_empty() {
            segments.push(TranscriptSegment {
                text,
                start: parse_timestamp(from)?,
                end: parse_timestamp(to)?,
                confidence: None,
                speaker: None,
            });
        }
    }
    if segments.is_empty() {
        return Err(ModelError::Inference(
            "whisper.cpp SRT transcript has no text".into(),
        ));
    }
    Ok(Transcript {
        language: None,
        text: segments
            .iter()
            .map(|s| s.text.as_str())
            .collect::<Vec<_>>()
            .join(" "),
        segments,
    })
}

fn parse_timestamp(value: &str) -> Result<Duration, ModelError> {
    let (h, rest) = value
        .split_once(':')
        .ok_or_else(|| ModelError::Inference("invalid SRT timestamp".into()))?;
    let (m, rest) = rest
        .split_once(':')
        .ok_or_else(|| ModelError::Inference("invalid SRT timestamp".into()))?;
    let (s, ms) = rest
        .split_once(',')
        .ok_or_else(|| ModelError::Inference("invalid SRT timestamp".into()))?;
    let millis = h
        .parse::<i64>()
        .and_then(|h| m.parse::<i64>().map(|m| (h, m)))
        .and_then(|(h, m)| s.parse::<i64>().map(|s| (h, m, s)))
        .and_then(|(h, m, s)| {
            ms.parse::<i64>()
                .map(|ms| ((h * 60 + m) * 60 + s) * 1000 + ms)
        })
        .map_err(|_| ModelError::Inference("invalid SRT timestamp".into()))?;
    Ok(Duration::milliseconds(millis))
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
            loaded: self.provider.is_loaded(model),
            warm: self.provider.is_warm(model),
            memory_bytes: None,
            backend: Some(PROVIDER_NAME.to_owned()),
            phase: None,
            progress_percent: None,
            error: None,
        }
    }
    fn select_route(&self, context: &ContextSnapshot) -> ModelRoute {
        let selected = self
            .provider
            .manifests()
            .iter()
            .find(|m| self.installed.iter().any(|id| id == &m.id))
            .map(|m| m.id.clone())
            .unwrap_or_else(|| ModelId::from("whisper-unavailable"));
        let reason = match context.privacy {
            PrivacyMode::LocalOnly | PrivacyMode::NeverCloud => "local privacy policy",
            _ => "local whisper.cpp default",
        }
        .to_owned();
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
    use sori_core::{AudioFormat, ModelLicense, ProfileMode};
    use std::sync::Mutex;

    fn manifest(id: &str) -> ModelManifest {
        ModelManifest {
            id: ModelId::from(id),
            display_name: id.into(),
            language: "en".into(),
            backend: PROVIDER_NAME.into(),
            quantization: None,
            disk_size_bytes: None,
            ram_bytes: None,
            license: ModelLicense {
                name: "MIT".into(),
                url: None,
                attribution: None,
            },
        }
    }

    #[test]
    fn builds_model_path_and_json_command() {
        let model_dir =
            std::env::temp_dir().join(format!("sori-whisper-test-{}", std::process::id()));
        std::fs::create_dir_all(&model_dir).unwrap();
        std::fs::write(model_dir.join("small.en.bin"), b"fake model").unwrap();
        let provider = WhisperCppProvider::from_config(
            WhisperCppConfig::new("whisper-cli", Some(model_dir.clone())),
            vec![manifest("small.en.bin")],
        );
        let spec = provider
            .process_spec_with_format(
                &ModelId::from("small.en.bin"),
                Path::new("in.wav"),
                Path::new("out"),
                OutputFormat::Json,
            )
            .unwrap();
        assert_eq!(spec.arguments[0], "-m");
        assert_eq!(
            spec.arguments[1],
            model_dir.join("small.en.bin").display().to_string()
        );
        assert_eq!(&spec.arguments[4..], ["-oj", "-of", "out"]);
        let _ = std::fs::remove_dir_all(model_dir);
    }

    #[test]
    fn encodes_f32_audio_as_pcm16_wav() {
        let audio = vec![AudioChunk {
            captured_at: time::OffsetDateTime::UNIX_EPOCH,
            format: sori_core::AudioFormat {
                sample_rate_hz: 16_000,
                channels: 1,
                sample_format: SampleFormat::F32,
            },
            samples: vec![-1.0, 0.0, 1.0],
        }];
        let wav = encode_wav(&audio).unwrap();
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 6);
        assert_eq!(
            &wav[44..50],
            &[-32768i16, 0, 32767]
                .iter()
                .flat_map(|v| v.to_le_bytes())
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn parses_text_json_and_srt_without_a_real_binary() {
        let text = parse_transcript(" hello world \n", OutputFormat::Text).unwrap();
        assert_eq!(text.text, "hello world");
        let json = parse_transcript(r#"{"language":"en","transcription":[{"offsets":{"from":10,"to":20},"text":" hello "}]}"#, OutputFormat::Json).unwrap();
        assert_eq!(json.segments[0].start, Duration::milliseconds(10));
        let srt = parse_transcript(
            "1\n00:00:01,000 --> 00:00:02,500\nhello\n",
            OutputFormat::Srt,
        )
        .unwrap();
        assert_eq!(srt.segments[0].end, Duration::milliseconds(2500));
    }

    struct FakeRunner;

    impl ProcessRunner for FakeRunner {
        fn run(&self, spec: &ExternalProcessSpec) -> Result<ProcessOutput, ModelError> {
            let prefix = PathBuf::from(&spec.arguments[spec.arguments.len() - 1]);
            std::fs::write(prefix.with_extension("txt"), "fake transcript").unwrap();
            let status = if cfg!(windows) {
                std::process::Command::new("cmd")
                    .args(["/C", "exit", "0"])
                    .status()
            } else {
                std::process::Command::new("true").status()
            }
            .unwrap();
            Ok(ProcessOutput {
                status,
                stdout: String::new(),
                stderr: String::new(),
            })
        }
    }

    #[test]
    fn fake_runner_executes_spec_and_parses_output() {
        let provider = WhisperCppProvider::new("whisper-cli", vec![manifest("small.en")]);
        let output =
            std::env::temp_dir().join(format!("sori-whisper-output-{}", std::process::id()));
        let transcript = provider
            .transcribe_with_runner(
                &ModelId::from("small.en"),
                Path::new("in.wav"),
                &output,
                OutputFormat::Text,
                &FakeRunner,
            )
            .unwrap();
        assert_eq!(transcript.text, "fake transcript");
        let _ = std::fs::remove_file(output.with_extension("txt"));
    }

    #[test]
    fn audio_runner_writes_wav_invokes_command_and_cleans_files() {
        struct InspectingRunner {
            input: Mutex<Option<Vec<u8>>>,
            spec: Mutex<Option<ExternalProcessSpec>>,
        }

        impl ProcessRunner for InspectingRunner {
            fn run(&self, spec: &ExternalProcessSpec) -> Result<ProcessOutput, ModelError> {
                *self.spec.lock().unwrap() = Some(spec.clone());
                let input = PathBuf::from(&spec.arguments[3]);
                *self.input.lock().unwrap() = Some(std::fs::read(input).unwrap());
                std::fs::write(
                    output_with_extension(Path::new(&spec.arguments[6]), "txt"),
                    "captured transcript",
                )
                .unwrap();
                let status = if cfg!(windows) {
                    std::process::Command::new("cmd")
                        .args(["/C", "exit", "0"])
                        .status()
                } else {
                    std::process::Command::new("true").status()
                }
                .unwrap();
                Ok(ProcessOutput {
                    status,
                    stdout: String::new(),
                    stderr: String::new(),
                })
            }
        }

        let runner = InspectingRunner {
            input: Mutex::new(None),
            spec: Mutex::new(None),
        };
        let provider = WhisperCppProvider::new("whisper-cli", vec![manifest("small.en")]);
        let audio = vec![AudioChunk {
            captured_at: time::OffsetDateTime::UNIX_EPOCH,
            format: AudioFormat {
                sample_rate_hz: 16_000,
                channels: 1,
                sample_format: SampleFormat::F32,
            },
            samples: vec![-1.0, 0.0, 1.0],
        }];
        let transcript = provider
            .transcribe_audio_with_runner(
                &ModelId::from("small.en"),
                &audio,
                OutputFormat::Text,
                &runner,
            )
            .unwrap();
        assert_eq!(transcript.text, "captured transcript");
        assert_eq!(
            runner.input.lock().unwrap().as_ref().unwrap()[44..],
            [0, 128, 0, 0, 255, 127]
        );
        let spec = runner.spec.lock().unwrap().clone().unwrap();
        assert_eq!(spec.executable, PathBuf::from("whisper-cli"));
        assert_eq!(spec.arguments[0], "-m");
        assert_eq!(spec.arguments[1], "small.en");
        assert_eq!(spec.arguments[2], "-f");
        assert_eq!(spec.arguments[4], "-otxt");
        assert_eq!(spec.arguments[5], "-of");
        assert!(!Path::new(&spec.arguments[3]).exists());
        assert!(!output_with_extension(Path::new(&spec.arguments[6]), "txt").exists());
    }

    #[test]
    fn process_failure_is_reported_without_a_transcript() {
        struct FailingRunner;
        impl ProcessRunner for FailingRunner {
            fn run(&self, _spec: &ExternalProcessSpec) -> Result<ProcessOutput, ModelError> {
                Err(ModelError::Inference("runner unavailable".into()))
            }
        }
        let provider = WhisperCppProvider::new("whisper-cli", vec![manifest("small.en")]);
        let error = provider
            .transcribe_with_runner(
                &ModelId::from("small.en"),
                Path::new("input.wav"),
                Path::new("output"),
                OutputFormat::Text,
                &FailingRunner,
            )
            .unwrap_err();
        assert!(error.to_string().contains("runner unavailable"));
    }

    #[test]
    fn cancellation_and_timeout_are_rejected_before_launch() {
        struct MustNotRun;
        impl ProcessRunner for MustNotRun {
            fn run(&self, _spec: &ExternalProcessSpec) -> Result<ProcessOutput, ModelError> {
                panic!("cancelled process was launched")
            }
        }
        let provider = WhisperCppProvider::new("whisper-cli", vec![manifest("small.en")]);
        let cancelled = provider.transcribe_audio_with_runner_options(
            &ModelId::from("small.en"),
            &[test_audio()],
            OutputFormat::Text,
            &MustNotRun,
            &ProcessOptions::cancelled(),
        );
        assert!(cancelled.unwrap_err().to_string().contains("cancelled"));
        let timeout = provider.transcribe_audio_with_runner_options(
            &ModelId::from("small.en"),
            &[test_audio()],
            OutputFormat::Text,
            &MustNotRun,
            &ProcessOptions {
                timeout: Some(StdDuration::ZERO),
                ..ProcessOptions::default()
            },
        );
        assert!(timeout.unwrap_err().to_string().contains("timed out"));
    }

    #[test]
    fn discovery_rejects_missing_executable() {
        let previous = std::env::var_os("SORI_WHISPER_CPP_BIN");
        unsafe {
            std::env::set_var("SORI_WHISPER_CPP_BIN", "definitely-missing-whisper-binary");
        }
        let error = WhisperCppConfig::discover().unwrap_err();
        match previous {
            Some(value) => unsafe { std::env::set_var("SORI_WHISPER_CPP_BIN", value) },
            None => unsafe { std::env::remove_var("SORI_WHISPER_CPP_BIN") },
        }
        assert!(error.to_string().contains("does not exist"));
    }

    #[test]
    fn malformed_output_and_missing_prerequisites_are_explicit() {
        assert!(parse_transcript("{}", OutputFormat::Json).is_err());
        assert!(parse_transcript("not an srt", OutputFormat::Srt).is_err());
        let model_dir =
            std::env::temp_dir().join(format!("sori-missing-model-{}", std::process::id()));
        std::fs::create_dir_all(&model_dir).unwrap();
        let provider = WhisperCppProvider::from_config(
            WhisperCppConfig::new("definitely-missing-whisper", Some(model_dir.clone())),
            vec![manifest("small.en.bin")],
        );
        let error = provider
            .process_spec_with_format(
                &ModelId::from("small.en.bin"),
                Path::new("in"),
                Path::new("out"),
                OutputFormat::Text,
            )
            .unwrap_err();
        assert!(error.to_string().contains("model file does not exist"));
        std::fs::remove_dir_all(model_dir).unwrap();
    }

    fn test_audio() -> AudioChunk {
        AudioChunk {
            captured_at: time::OffsetDateTime::UNIX_EPOCH,
            format: AudioFormat {
                sample_rate_hz: 16_000,
                channels: 1,
                sample_format: SampleFormat::F32,
            },
            samples: vec![0.0],
        }
    }

    #[test]
    fn empty_model_directory_is_truthfully_empty() {
        let root = std::env::temp_dir().join(format!("sori-whisper-empty-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let provider = WhisperCppProvider::from_config(
            WhisperCppConfig::new("missing", Some(root.clone())),
            vec![],
        );
        assert!(provider.discover_models().unwrap().is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_model_directory_is_an_explicit_discovery_error() {
        let provider =
            WhisperCppProvider::from_config(WhisperCppConfig::new("missing", None), vec![]);
        let error = provider.discover_models().unwrap_err();
        assert!(
            error
                .to_string()
                .contains("model directory is not configured")
        );
    }

    #[test]
    fn discovers_only_real_models_and_rejects_path_escape() {
        let root =
            std::env::temp_dir().join(format!("sori-whisper-discovery-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("ggml-base.en.bin"), b"model").unwrap();
        std::fs::write(root.join("readme.txt"), b"not a model").unwrap();
        let provider = WhisperCppProvider::from_config(
            WhisperCppConfig::new("missing", Some(root.clone())),
            vec![],
        );
        let models = provider.discover_models().unwrap();
        assert_eq!(
            models.iter().map(|m| &m.id).collect::<Vec<_>>(),
            vec![&ModelId::from("ggml-base.en.bin")]
        );
        let error = provider
            .verified_model_path(&ModelId::from("../outside.bin"))
            .unwrap_err();
        assert!(error.to_string().contains("invalid whisper.cpp model path"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn status_reports_unavailable_until_verified_model_exists() {
        let root = std::env::temp_dir().join(format!("sori-whisper-status-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let provider = WhisperCppProvider::from_config(
            WhisperCppConfig::new("missing", Some(root.clone())),
            vec![manifest("model.bin")],
        );
        assert_eq!(
            provider.status(&ModelId::from("model.bin")).lifecycle,
            WhisperLifecycle::Unavailable
        );
        std::fs::write(root.join("model.bin"), b"model").unwrap();
        assert_eq!(
            provider.status(&ModelId::from("model.bin")).lifecycle,
            WhisperLifecycle::Ready
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn installs_checksum_verified_model_atomically() {
        let root =
            std::env::temp_dir().join(format!("sori-whisper-install-{}", std::process::id()));
        let source = root.join("source.bin");
        let model_dir = root.join("models");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(&source, b"fixture model").unwrap();
        let digest = format!("{:x}", sha2::Sha256::digest(b"fixture model"));
        let provider = WhisperCppProvider::from_config(
            WhisperCppConfig::new("whisper-cli", Some(model_dir)),
            vec![manifest("fixture.bin")],
        );
        let installed = provider
            .install_model_from_file(&ModelId::from("fixture.bin"), &source, Some(&digest))
            .unwrap();
        assert_eq!(std::fs::read(installed).unwrap(), b"fixture model");
        assert_eq!(
            provider.status(&ModelId::from("fixture.bin")).lifecycle,
            WhisperLifecycle::Ready
        );
        assert_eq!(
            provider.status(&ModelId::from("fixture.bin")).lifecycle,
            WhisperLifecycle::Ready
        );
        let runtime_status = provider.runtime_status(&ModelId::from("fixture.bin"));
        assert_eq!(runtime_status.phase.as_deref(), Some("Ready"));
        assert_eq!(runtime_status.progress_percent, Some(100));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn model_lifecycle_load_warm_unload_remove_is_truthful() {
        let root =
            std::env::temp_dir().join(format!("sori-whisper-lifecycle-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let binary = root.join("whisper-cli");
        let model = root.join("model.bin");
        std::fs::write(&binary, b"binary").unwrap();
        std::fs::write(&model, b"model").unwrap();
        let provider = WhisperCppProvider::from_config(
            WhisperCppConfig::new(binary, Some(root.clone())),
            vec![manifest("model.bin")],
        );
        let id = ModelId::from("model.bin");
        assert!(!provider.is_loaded(&id));
        provider.load(&id).unwrap();
        assert!(provider.is_loaded(&id));
        provider.warm(&id).unwrap();
        assert!(provider.is_warm(&id));
        provider.unload(&id);
        assert!(!provider.is_loaded(&id));
        provider.remove_model(&id).unwrap();
        assert!(provider.verified_model_path(&id).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn install_does_not_create_a_synthetic_manifest_and_honors_cancellation() {
        let root =
            std::env::temp_dir().join(format!("sori-whisper-no-fake-{}", std::process::id()));
        let source = root.join("not-a-model.bin");
        let model_dir = root.join("models");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(&source, b"fixture model").unwrap();
        let digest = format!("{:x}", sha2::Sha256::digest(b"fixture model"));
        let provider = WhisperCppProvider::from_config(
            WhisperCppConfig::new("whisper-cli", Some(model_dir.clone())),
            Vec::new(),
        );
        let cancelled = CancellationToken::new();
        cancelled.cancel();
        assert!(matches!(
            <WhisperCppProvider as ModelProvider>::install_model_from_file_cancelled(
                &provider,
                &ModelId::from("not-a-model.bin"),
                &source,
                &digest,
                &cancelled
            ),
            Err(ModelError::Cancelled)
        ));
        assert!(provider.manifests().is_empty());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    #[ignore = "requires a real whisper-cli binary, model, and fixture WAV"]
    fn real_fixture_transcription_smoke() {
        let binary = std::env::var_os("SORI_WHISPER_CPP_BIN").expect("set SORI_WHISPER_CPP_BIN");
        let model_dir =
            std::env::var_os("SORI_WHISPER_MODEL_DIR").expect("set SORI_WHISPER_MODEL_DIR");
        let model = ModelId::from(
            std::env::var("SORI_WHISPER_MODEL")
                .as_deref()
                .unwrap_or("ggml-base.en.bin"),
        );
        let fixture = PathBuf::from(
            std::env::var_os("SORI_WHISPER_FIXTURE_WAV").expect("set SORI_WHISPER_FIXTURE_WAV"),
        );
        let provider = WhisperCppProvider::from_config(
            WhisperCppConfig::new(binary, Some(model_dir.into())),
            vec![manifest(&model.0)],
        );
        let output = std::env::temp_dir().join("sori-whisper-fixture-smoke");
        let transcript = provider
            .transcribe_with_runner(
                &model,
                &fixture,
                &output,
                OutputFormat::Text,
                &CommandProcessRunner,
            )
            .unwrap();
        assert!(!transcript.text.trim().is_empty());
        let _ = std::fs::remove_file(output.with_extension("txt"));
    }

    #[test]
    fn unsupported_model_is_rejected_before_process_launch() {
        let provider = WhisperCppProvider::new("whisper-cli", vec![manifest("small.en")]);
        let error = provider
            .process_spec(&ModelId::from("missing"), Path::new("in"), Path::new("out"))
            .unwrap_err();
        assert!(matches!(error, ModelError::Unsupported(_)));
        let route = WhisperRuntime::new(provider, Vec::new()).select_route(&ContextSnapshot {
            profile: ProfileMode::Coding,
            ..Default::default()
        });
        assert_eq!(route.model, ModelId::from("whisper-unavailable"));
    }
}
