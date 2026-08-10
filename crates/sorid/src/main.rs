use anyhow::Result;
use sori_core::{EventKind, InMemoryEventBus};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "sorid=info".into()),
        )
        .init();

    let events = InMemoryEventBus::default();
    events.publish_kind(EventKind::AudioStarted);
    info!("sorid scaffold started; IPC/audio/injection adapters are not wired yet");

    #[cfg(unix)]
    tokio::signal::ctrl_c().await?;

    #[cfg(not(unix))]
    tokio::signal::ctrl_c().await?;

    info!("sorid stopped");
    Ok(())
}
