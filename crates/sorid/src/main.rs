use anyhow::Result;
use sori_core::{PrivacyMode, ProfileMode};
use sori_ipc::{
    ConfigSummaryResponse, ControlResponse, DEFAULT_ENDPOINT, DoctorCheck, DoctorResponse,
    IpcEvent, LocalIpcServer, PROTOCOL_VERSION, RecentEventsResponse, Request, Response,
    RouteSummary, RuntimeActivity, StatusResponse,
};
use sori_persistence::SqliteStore;
use sorid::{DaemonConfig, DaemonRuntime, RuntimeState, SharedEventBus};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
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
    let store = Arc::new(SqliteStore::open(&config.persistence_path)?);
    let runtime = Arc::new(Mutex::new(DaemonRuntime::new(SharedEventBus(Arc::clone(
        &store,
    )))));
    let endpoint: SocketAddr = DEFAULT_ENDPOINT.parse().expect("valid IPC endpoint");
    let server = LocalIpcServer::bind(endpoint).await?;
    info!(
        hotkey = %config.hotkey.binding,
        persistence_path = ?config.persistence_path,
        endpoint = %server.local_addr()?,
        "sorid ready; local IPC endpoint listening"
    );

    let handler_runtime = Arc::clone(&runtime);
    let handler_store = Arc::clone(&store);
    let handler_config = config.clone();
    let server_task = server.serve(move |request| {
        let mut runtime = handler_runtime
            .lock()
            .map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?;
        let response = match request {
            Request::Status => Response::Status(status_response(&runtime, &handler_config)),
            Request::Doctor => {
                let sqlite_ok = handler_store.migration_status().unwrap_or(false);
                Response::Doctor(DoctorResponse {
                    status: status_response(&runtime, &handler_config),
                    checks: vec![
                        DoctorCheck {
                            name: "daemon".into(),
                            ok: true,
                            detail: "sorid is reachable over loopback".into(),
                        },
                        DoctorCheck {
                            name: "ipc-bind".into(),
                            ok: true,
                            detail: format!("bound to {DEFAULT_ENDPOINT}"),
                        },
                        DoctorCheck {
                            name: "sqlite".into(),
                            ok: sqlite_ok,
                            detail: if sqlite_ok {
                                "SQLite open and migrations applied"
                            } else {
                                "SQLite migration check failed"
                            }
                            .into(),
                        },
                    ],
                })
            }
            Request::ConfigSummary => Response::ConfigSummary(ConfigSummaryResponse {
                profile: ProfileMode::Basic,
                privacy: PrivacyMode::LocalOnly,
                history_enabled: !handler_config.persistence_path.as_os_str().is_empty(),
                hotkey: handler_config.hotkey.binding.clone(),
                route: route_summary(&handler_config),
            }),
            Request::RecentEvents { limit } => Response::RecentEvents(RecentEventsResponse {
                events: handler_store
                    .try_recent_events_limit(usize::from(limit))
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                    .into_iter()
                    .rev()
                    .map(IpcEvent::from)
                    .collect(),
            }),
            Request::Pause => {
                runtime
                    .pause()
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse {
                    accepted: true,
                    detail: "daemon paused".into(),
                })
            }
            Request::Resume => {
                runtime
                    .resume()
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse {
                    accepted: true,
                    detail: "daemon resumed".into(),
                })
            }
        };
        Ok(response)
    });

    tokio::select! {
        result = server_task => { result?; }
        signal = tokio::signal::ctrl_c() => {
            signal?;
            let mut runtime = runtime.lock().map_err(|_| anyhow::anyhow!("runtime lock poisoned"))?;
            runtime.shutdown()?;
            if matches!(runtime.state(), RuntimeState::ShuttingDown) { info!("sorid stopped gracefully"); }
        }
    }
    Ok(())
}

fn route_summary(config: &DaemonConfig) -> RouteSummary {
    RouteSummary {
        prefer_local: config.route.prefer_local,
        allow_cloud: config.route.allow_cloud,
        prefer_warm_runtime: config.route.prefer_warm_runtime,
        optimize_battery: config.route.optimize_battery,
    }
}

fn status_response<B: sori_core::EventBus>(
    runtime: &DaemonRuntime<B>,
    config: &DaemonConfig,
) -> StatusResponse {
    let (running, activity, paused) = match runtime.state() {
        RuntimeState::Ready => (true, RuntimeActivity::Idle, false),
        RuntimeState::Paused => (true, RuntimeActivity::Paused, true),
        RuntimeState::Error(_) => (true, RuntimeActivity::Error, false),
        RuntimeState::ShuttingDown => (false, RuntimeActivity::Stopping, false),
    };
    StatusResponse {
        protocol_version: PROTOCOL_VERSION,
        daemon_version: env!("CARGO_PKG_VERSION").into(),
        running,
        activity,
        paused,
        hotkey: config.hotkey.binding.clone(),
        route: route_summary(config),
        profile: ProfileMode::Basic,
        privacy: PrivacyMode::LocalOnly,
    }
}
