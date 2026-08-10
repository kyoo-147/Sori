//! External whisper.cpp provider boundary.
//!
//! This crate does not link or vendor whisper.cpp. It discovers a separately
//! installed executable, builds safe argument vectors, and parses the files
//! produced by the whisper.cpp CLI.

use serde_json::Value;
use sori_core::{
    AudioChunk, ContextSnapshot, ExternalProcessProvider, ExternalProcessSpec, ModelError, ModelId,
    ModelManifest, ModelProvider, ModelRoute, ModelRuntime, PrivacyMode, RuntimeStatus, Transcript,
    TranscriptSegment,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitStatus;
use time::Duration;

pub const PROVIDER_NAME: &str = "whisper.cpp";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WhisperCppConfig {
    pub executable: PathBuf,
    pub model_dir: Option<PathBuf>,
}

impl WhisperCppConfig {
    /// Discover the CLI and optional model directory from explicit values or
    /// `SORI_WHISPER_CPP_BIN` / `WHISPER_CPP_BIN` and `SORI_WHISPER_MODEL_DIR`.
    pub fn discover() -> Result<Self, ModelError> {
        let executable = std::env::var_os("SORI_WHISPER_CPP_BIN")
            .or_else(|| std::env::var_os("WHISPER_CPP_BIN"))
            .map(PathBuf::from)
            .or_else(|| find_on_path(if cfg!(windows) { "whisper-cli.exe" } else { "whisper-cli" }))
            .or_else(|| find_on_path(if cfg!(windows) { "main.exe" } else { "main" }))
            .ok_or_else(|| ModelError::Inference("whisper.cpp executable was not found; set SORI_WHISPER_CPP_BIN or install whisper-cli on PATH".into()))?;
        if !executable.is_file() {
            return Err(ModelError::Inference(format!(
                "whisper.cpp executable does not exist: {}",
                executable.display()
            )));
        }
        let model_dir = std::env::var_os("SORI_WHISPER_MODEL_DIR")
            .or_else(|| std::env::var_os("WHISPER_CPP_MODEL_DIR"))
            .map(PathBuf::from);
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
    manifests: Vec<ModelManifest>,
}

impl WhisperCppProvider {
    /// Compatibility constructor for callers that already resolved a binary.
    pub fn new(executable: impl Into<PathBuf>, manifests: Vec<ModelManifest>) -> Self {
        Self {
            executable: executable.into(),
            model_dir: None,
            manifests,
        }
    }

    pub fn from_config(config: WhisperCppConfig, manifests: Vec<ModelManifest>) -> Self {
        Self {
            executable: config.executable,
            model_dir: config.model_dir,
            manifests,
        }
    }

    pub fn executable(&self) -> &Path {
        &self.executable
    }
    pub fn model_dir(&self) -> Option<&Path> {
        self.model_dir.as_deref()
    }

    pub fn model_path(&self, model: &ModelId) -> PathBuf {
        self.model_dir
            .as_ref()
            .map(|dir| dir.join(&model.0))
            .unwrap_or_else(|| PathBuf::from(&model.0))
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
        let model_path = self.model_path(model);
        if self.model_dir.is_some() && !model_path.is_file() {
            return Err(ModelError::Inference(format!(
                "whisper.cpp model file does not exist: {}",
                model_path.display()
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
        let spec = self.process_spec_with_format(model, input, output, format)?;
        let result = runner.run(&spec)?;
        if !result.status.success() {
            return Err(ModelError::Inference(if result.stderr.is_empty() {
                "whisper.cpp exited unsuccessfully".into()
            } else {
                result.stderr
            }));
        }
        let actual = output_with_extension(output, format.arguments().1);
        let content = fs::read_to_string(&actual).map_err(|error| {
            ModelError::Inference(format!(
                "whisper.cpp output could not be read ({}): {error}",
                actual.display()
            ))
        })?;
        parse_transcript(&content, format)
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

pub trait ProcessRunner {
    fn run(&self, spec: &ExternalProcessSpec) -> Result<ProcessOutput, ModelError>;
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
            "audio supervision is owned by the host; use transcribe_with_runner".into(),
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
        self.process_spec_with_format(model, input, output, OutputFormat::Text)
    }
}

/// Parse text, whisper.cpp JSON, or SRT output without depending on a process.
pub fn parse_transcript(content: &str, format: OutputFormat) -> Result<Transcript, ModelError> {
    match format {
        OutputFormat::Text => Ok(Transcript::plain(content.trim())),
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
    use sori_core::{ModelLicense, ProfileMode};

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
