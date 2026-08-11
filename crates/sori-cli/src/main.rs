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
    /// Print benchmark scaffolding status.
    Benchmark,
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
        Command::Benchmark => benchmark(),
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
                for check in result.checks {
                    println!(
                        "- {}: {} ({})",
                        check.name,
                        if check.ok { "ok" } else { "failed" },
                        check.detail
                    );
                }
            }
            _ => println!("- daemon IPC: invalid response"),
        },
        Err(_) => println!("- daemon IPC: unavailable (is sorid running?)"),
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

fn benchmark() -> Result<()> {
    println!("Sori benchmark");
    println!("- benchmark runner: not wired yet");
    println!("- route simulation: scaffold only");
    Ok(())
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
