use anyhow::Result;
use clap::{Parser, Subcommand};
use sori_core::{ContextSnapshot, PrivacyMode, ProfileMode};
use sori_ipc::{IpcClient, LocalIpcClient, Request, Response};

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
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command.unwrap_or(Command::Status) {
        Command::Doctor => doctor(),
        Command::Status => status(),
        Command::Context => context(),
        Command::Benchmark => benchmark(),
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
    println!("- audio backend: not wired yet");
    println!("- text injection: not wired yet");
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
