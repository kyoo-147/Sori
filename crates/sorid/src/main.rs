use anyhow::Result;
use sori_core::InMemoryEventBus;
use sorid::{DaemonConfig, DaemonRuntime, RuntimeState};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "sorid=info".into()),
        )
        .init();

    let config = DaemonConfig::default();
    config.validate().map_err(anyhow::Error::msg)?;
    let events = InMemoryEventBus::default();
    let mut runtime = DaemonRuntime::new(events);
    info!(
        hotkey = %config.hotkey.binding,
        persistence_path = ?config.persistence_path,
        state = ?runtime.state(),
        "sorid ready; platform adapters are integration boundaries"
    );

    tokio::signal::ctrl_c().await?;
    runtime.shutdown()?;
    if matches!(runtime.state(), RuntimeState::ShuttingDown) {
        info!("sorid stopped gracefully");
    }
    Ok(())
}
