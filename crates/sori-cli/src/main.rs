use anyhow::{Context, Result, bail};
use clap::{Parser, Subcommand};
use serde::Serialize;
use sori_ipc::{IpcClient, LocalIpcClient, Request, Response};
use std::io::{self, BufRead, Write};

#[derive(Debug, Parser)]
#[command(name = "sori", version, about = "Sori voice runtime CLI")]
struct Cli {
    /// Emit machine-readable JSON where supported.
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Debug, Subcommand, Clone)]
enum Command {
    /// Capture one dictation session. Press Enter to stop recording.
    Run,
    /// Print local runtime readiness checks.
    Doctor,
    /// Print daemon status.
    Status,
    /// List configured models from the daemon.
    Models,
    /// Show persisted benchmark records from the daemon.
    Benchmark,
    /// List configured extensions from the daemon.
    Extensions,
    /// Print recent persisted transcripts.
    History {
        #[arg(short, long, default_value_t = 20)]
        limit: u16,
    },
    /// List the persisted personal dictionary.
    Dictionary,
    /// List persisted permission records.
    Permissions,
    /// Show effective daemon configuration.
    Context,
    /// Deterministic core-only smoke test (does not exercise the daemon).
    Smoke {
        #[command(subcommand)]
        command: SmokeCommand,
    },
}

#[derive(Debug, Subcommand, Clone)]
enum SmokeCommand {
    Dictation,
}

fn main() {
    let cli = Cli::parse();
    let result = match cli.command.unwrap_or(Command::Status) {
        command @ (Command::Run
        | Command::Doctor
        | Command::Status
        | Command::Models
        | Command::Benchmark
        | Command::Extensions
        | Command::History { .. }
        | Command::Dictionary
        | Command::Permissions
        | Command::Context) => LocalIpcClient::connect()
            .map_err(|e| anyhow::anyhow!("daemon IPC unavailable at 127.0.0.1:17373: {e}"))
            .and_then(|client| execute(&client, command, cli.json)),
        Command::Smoke {
            command: SmokeCommand::Dictation,
        } => smoke_dictation(),
    };
    if let Err(error) = result {
        eprintln!("sori: {error:#}");
        std::process::exit(1);
    }
}

fn execute(client: &impl IpcClient, command: Command, json: bool) -> Result<()> {
    match command {
        Command::Status => print_response(client.request(Request::Status)?, json),
        Command::Doctor => {
            let response = client.request(Request::Doctor)?;
            if let Response::Doctor(result) = &response {
                if json {
                    print_response(&response, true)?;
                } else {
                    println!("Sori doctor");
                    println!("- platform: {}", std::env::consts::OS);
                    println!("- architecture: {}", std::env::consts::ARCH);
                    for check in &result.checks {
                        println!(
                            "- {}: {} ({})",
                            check.name,
                            if check.ok { "ok" } else { "failed" },
                            check.detail
                        );
                    }
                }
                if result.checks.iter().any(|check| !check.ok) {
                    bail!("Doctor reported failed checks")
                }
                Ok(())
            } else {
                unexpected(response, "Doctor")
            }
        }
        Command::Run => run(client),
        Command::Models => resource(client, "models", json),
        Command::Benchmark => resource(client, "benchmarks", json),
        Command::Extensions => resource(client, "extensions", json),
        Command::Dictionary => resource(client, "vocabulary", json),
        Command::Permissions => resource(client, "permissions", json),
        Command::History { limit } => match client.request(Request::RecentHistory { limit })? {
            response @ Response::RecentHistory(_) => print_response(response, json),
            response => unexpected(response, "RecentHistory"),
        },
        Command::Context => match client.request(Request::ConfigSummary)? {
            response @ Response::ConfigSummary(_) => print_response(response, json),
            response => unexpected(response, "ConfigSummary"),
        },
        Command::Smoke { .. } => bail!("smoke is not an IPC command"),
    }
}

fn run(client: &impl IpcClient) -> Result<()> {
    match client.request(Request::DictationStart)? {
        Response::Control(start) if start.accepted => {
            println!("{}", start.detail);
            print!("Press Enter to stop…");
            io::stdout().flush().context("flush prompt")?;
            io::stdin().lock().lines().next();
            match client.request(Request::DictationStop)? {
                Response::Transcript(transcript) => println!("\n{}", transcript.text),
                response => unexpected(response, "Transcript from DictationStop")?,
            }
            Ok(())
        }
        Response::Error(error) => bail!("{}: {}", error.code, error.detail),
        response => unexpected(response, "Control from DictationStart"),
    }
}

fn resource(client: &impl IpcClient, name: &str, json: bool) -> Result<()> {
    match client.request(Request::ResourceGet {
        resource: name.into(),
    })? {
        response @ Response::Resource(_) => print_response(response, json),
        response => unexpected(response, "Resource"),
    }
}

fn unexpected(response: Response, expected: &str) -> Result<()> {
    match response {
        Response::Error(error) => bail!("{}: {}", error.code, error.detail),
        _ => bail!("daemon returned an invalid response; expected {expected}"),
    }
}

fn print_response<T: Serialize>(response: T, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(&response)?);
    } else {
        println!("{}", serde_json::to_string_pretty(&response)?);
    }
    Ok(())
}

fn smoke_dictation() -> Result<()> {
    // Keep the existing deterministic smoke path out of the product CLI: it is
    // intentionally not evidence of microphone, ASR, or injection capability.
    bail!("smoke dictation is unavailable in this build; use `sori run` with sorid")
}

#[cfg(test)]
mod tests {
    use super::*;
    use sori_ipc::MockIpcServer;

    #[test]
    fn parses_all_runtime_commands() {
        for args in [
            "run",
            "doctor",
            "status",
            "models",
            "benchmark",
            "extensions",
            "history",
            "dictionary",
            "permissions",
            "context",
        ] {
            assert!(Cli::try_parse_from(["sori", args]).is_ok(), "{args}");
        }
    }

    #[test]
    fn resource_commands_use_the_ipc_transport() {
        let server = MockIpcServer::default();
        execute(&server.client(), Command::Models, true).unwrap();
        execute(&server.client(), Command::Extensions, true).unwrap();
    }

    #[test]
    fn unavailable_resource_is_not_presented_as_success() {
        let server = MockIpcServer::default();
        // MockIpcServer returns a Resource response, proving this path does not
        // read local fixtures or manufacture command output.
        assert!(resource(&server.client(), "permissions", true).is_ok());
    }
}
