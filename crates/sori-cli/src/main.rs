use anyhow::Result;
use clap::{Parser, Subcommand};
use sori_core::{
    AdapterTextInjector, AudioChunk, AudioEngine, AudioError, AudioFormat, ContextSnapshot,
    EventBus, InMemoryEventBus, InMemoryHistory, ModelError, ModelId, ModelProvider, ModelRoute,
    PrivacyMode, ProfileMode, SampleFormat, TextInjectionAdapter, TextTarget,
    TextTargetCapabilities, Transcript, run_dictation,
};
use sori_ipc::{IpcClient, LocalIpcClient, Request, Response};
use time::OffsetDateTime;

#[derive(Debug, Parser)]
#[command(name = "sori", version, about = "Sori voice runtime CLI")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Print local runtime readiness checks.
    Doctor,
    /// Print daemon status.
    Status,
    /// Show the effective context defaults.
    Context,
    /// Run real provider benchmarks through sorid.
    Benchmark {
        #[arg(long)]
        model: String,
        #[arg(long)]
        audio: std::path::PathBuf,
        #[arg(long)]
        reference: Option<String>,
        #[arg(long, default_value_t = 5)]
        iterations: u16,
    },
    /// Run a deterministic trigger-to-history dictation smoke path.
    Smoke {
        #[command(subcommand)]
        command: SmokeCommand,
    },
}

#[derive(Debug, Subcommand)]
enum SmokeCommand {
    Dictation,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command.unwrap_or(Command::Status) {
        Command::Doctor => doctor(),
        Command::Status => status(),
        Command::Context => context(),
        Command::Benchmark {
            model,
            audio,
            reference,
            iterations,
        } => benchmark(model, audio, reference, iterations),
        Command::Smoke {
            command: SmokeCommand::Dictation,
        } => smoke_dictation(),
    }
}

fn doctor() -> Result<()> {
    println!("Sori doctor");
    println!("- platform: {}", std::env::consts::OS);
    println!("- architecture: {}", std::env::consts::ARCH);

    match LocalIpcClient::connect() {
        Ok(client) => match client.request(Request::Doctor)? {
            Response::Doctor(result) => {
                let failed = result.checks.iter().filter(|check| !check.ok).count();
                for check in result.checks {
                    println!(
                        "- {}: {} ({})",
                        check.name,
                        if check.ok { "ok" } else { "failed" },
                        check.detail
                    );
                }
                if failed > 0 {
                    anyhow::bail!(
                        "{failed} Doctor check(s) failed; resolve the reported prerequisite(s) and run Doctor again"
                    );
                }
            }
            _ => anyhow::bail!("daemon IPC returned an invalid Doctor response"),
        },
        Err(error) => anyhow::bail!(
            "daemon IPC unavailable at 127.0.0.1:17373 ({error}); start the intended sorid instance, then run Doctor again"
        ),
    }
    Ok(())
}

fn status() -> Result<()> {
    match LocalIpcClient::connect() {
        Ok(client) => match client.request(Request::Status)? {
            Response::Status(status) => println!(
                "sorid: {} (profile={:?}, privacy={:?})",
                if status.running { "running" } else { "stopped" },
                status.profile,
                status.privacy
            ),
            _ => println!("sorid: invalid IPC response"),
        },
        Err(_) => println!("sorid: not running (daemon IPC unavailable)"),
    }
    Ok(())
}

fn benchmark(
    model: String,
    audio_path: std::path::PathBuf,
    reference: Option<String>,
    iterations: u16,
) -> Result<()> {
    let audio = read_wav(&audio_path)?;
    let client =
        LocalIpcClient::connect().map_err(|e| anyhow::anyhow!("daemon IPC unavailable: {e}"))?;
    match client.request(Request::RunBenchmark {
        model: ModelId::from(model.as_str()),
        audio,
        reference,
        iterations,
    })? {
        Response::Benchmark(result) => println!(
            "model={} provider={} samples={} cold_ms={:.2} warm_ms={:.2} p50_ms={:.2} p95_ms={:.2} rtf={:.4} wer={} cer={} ram_bytes={}",
            result.model.0,
            result.provider,
            result.samples,
            result.startup.cold_ms,
            result.startup.warm_ms,
            result.latency.p50_ms,
            result.latency.p95_ms,
            result.real_time_factor,
            result
                .accuracy
                .as_ref()
                .and_then(|a| a.wer)
                .map_or("UNVERIFIED".into(), |v| format!("{v:.4}")),
            result
                .accuracy
                .as_ref()
                .and_then(|a| a.cer)
                .map_or("UNVERIFIED".into(), |v| format!("{v:.4}")),
            result
                .memory
                .ram_bytes
                .map_or("UNVERIFIED".into(), |v| v.to_string())
        ),
        Response::Error(error) => anyhow::bail!("benchmark failed: {}", error.detail),
        other => anyhow::bail!("unexpected benchmark response: {other:?}"),
    }
    Ok(())
}

fn read_wav(path: &std::path::Path) -> Result<Vec<AudioChunk>> {
    let bytes = std::fs::read(path)?;
    anyhow::ensure!(
        bytes.len() >= 44 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE",
        "only RIFF/WAVE audio is supported"
    );
    let channels = u16::from_le_bytes([bytes[22], bytes[23]]);
    let rate = u32::from_le_bytes(bytes[24..28].try_into()?);
    let bits = u16::from_le_bytes([bytes[34], bytes[35]]);
    anyhow::ensure!(
        channels == 1 && bits == 16,
        "benchmark audio must be mono PCM16 WAV"
    );
    let data = bytes
        .windows(4)
        .position(|window| window == b"data")
        .ok_or_else(|| anyhow::anyhow!("WAV data chunk missing"))?
        + 4;
    let size = u32::from_le_bytes(bytes[data..data + 4].try_into()?) as usize;
    let raw = &bytes[data + 4..(data + 4 + size).min(bytes.len())];
    let samples = raw
        .chunks_exact(2)
        .map(|s| i16::from_le_bytes([s[0], s[1]]) as f32 / i16::MAX as f32)
        .collect();
    Ok(vec![AudioChunk {
        captured_at: OffsetDateTime::now_utc(),
        format: AudioFormat {
            sample_rate_hz: rate,
            channels: 1,
            sample_format: SampleFormat::F32,
        },
        samples,
    }])
}

fn smoke_dictation() -> Result<()> {
    let format = AudioFormat {
        sample_rate_hz: 16_000,
        channels: 1,
        sample_format: SampleFormat::F32,
    };
    let mut audio = FakeAudio {
        chunks: vec![AudioChunk {
            captured_at: OffsetDateTime::UNIX_EPOCH,
            format,
            samples: vec![0.1, 0.2],
        }],
    };
    let asr = FakeAsr;
    let adapter = FakeInjectionAdapter;
    let mut injector = AdapterTextInjector::new(
        adapter,
        sori_core::InjectorCapabilities {
            direct_input: true,
            clipboard: false,
            clipboard_restore: false,
            undo: false,
        },
    );
    let target = FakeTarget;
    let history = InMemoryHistory::default();
    let events = InMemoryEventBus::default();
    let route = ModelRoute {
        provider: "fake".into(),
        model: ModelId::from("smoke"),
        reason: "CLI smoke".into(),
        fallback: vec![],
    };
    let result = run_dictation(
        &mut audio,
        &asr,
        &mut injector,
        &target,
        &route,
        &history,
        &events,
    )?;
    println!(
        "dictation smoke: trigger -> audio({}) -> asr -> transcript -> injection -> history",
        result.chunks
    );
    println!(
        "transcript={:?}, inserted={:?}, events={}",
        result.transcript.text,
        result.inserted_text,
        events.recent().len()
    );
    Ok(())
}

struct FakeAudio {
    chunks: Vec<AudioChunk>,
}
impl AudioEngine for FakeAudio {
    fn input_format(&self) -> AudioFormat {
        self.chunks
            .first()
            .map(|c| c.format.clone())
            .unwrap_or(AudioFormat {
                sample_rate_hz: 16_000,
                channels: 1,
                sample_format: SampleFormat::F32,
            })
    }
    fn next_chunk(&mut self) -> Result<Option<AudioChunk>, AudioError> {
        Ok(self.chunks.pop())
    }
}
struct FakeAsr;
impl ModelProvider for FakeAsr {
    fn provider_name(&self) -> &'static str {
        "fake"
    }
    fn can_transcribe(&self, _: &ModelId) -> bool {
        true
    }
    fn transcribe(&self, _: &ModelId, audio: &[AudioChunk]) -> Result<Transcript, ModelError> {
        Ok(Transcript::plain(format!(
            "fake transcript ({} chunks)",
            audio.len()
        )))
    }
}
struct FakeTarget;
impl TextTarget for FakeTarget {
    fn name(&self) -> &str {
        "fake-editor"
    }
    fn capabilities(&self) -> TextTargetCapabilities {
        TextTargetCapabilities {
            accepts_text: true,
            supports_direct_input: true,
            supports_clipboard_paste: false,
            supports_undo: false,
            requires_elevation: false,
        }
    }
}
struct FakeInjectionAdapter;
impl TextInjectionAdapter for FakeInjectionAdapter {
    fn send_direct_input(&mut self, _: &str) -> Result<(), String> {
        Ok(())
    }
    fn snapshot_clipboard(&mut self) -> Result<(), String> {
        Ok(())
    }
    fn set_clipboard_text(&mut self, _: &str) -> Result<(), String> {
        Ok(())
    }
    fn paste_from_clipboard(&mut self) -> Result<(), String> {
        Ok(())
    }
    fn restore_clipboard(&mut self) -> Result<(), String> {
        Ok(())
    }
    fn request_undo(&mut self) -> Result<(), String> {
        Ok(())
    }
}

fn context() -> Result<()> {
    let context = ContextSnapshot {
        profile: ProfileMode::Basic,
        privacy: PrivacyMode::LocalOnly,
        ..ContextSnapshot::default()
    };
    println!("profile={:?}", context.profile);
    println!("privacy={:?}", context.privacy);
    Ok(())
}
