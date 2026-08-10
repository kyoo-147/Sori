use anyhow::Result;
use clap::{Parser, Subcommand};
use sori_core::{ContextSnapshot, PrivacyMode, ProfileMode};

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
    /// Print daemon status placeholder until IPC is wired.
    Status,
    /// Show the effective context defaults.
    Context,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command.unwrap_or(Command::Status) {
        Command::Doctor => doctor(),
        Command::Status => status(),
        Command::Context => context(),
    }
}

fn doctor() -> Result<()> {
    println!("Sori doctor");
    println!("- platform: {}", std::env::consts::OS);
    println!("- architecture: {}", std::env::consts::ARCH);
    println!("- daemon IPC: not wired yet");
    println!("- audio backend: not wired yet");
    println!("- text injection: not wired yet");
    Ok(())
}

fn status() -> Result<()> {
    println!("sorid: not running (IPC not implemented yet)");
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
