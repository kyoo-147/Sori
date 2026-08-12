use anyhow::Result;
use sori_audio::CpalAudioController;
use sori_core::{ModelId, ModelLicense, ModelManifest, PrivacyMode, ProfileMode};
use sori_ipc::{
    CapabilitySummary, ConfigSummaryResponse, ControlResponse, DEFAULT_ENDPOINT, DoctorCheck,
    DoctorResponse, IpcEvent, LocalIpcServer, PROTOCOL_VERSION, RecentEventsResponse,
    RecentHistoryResponse, Request, Response, RouteSummary, RuntimeActivity, StatusResponse,
};
use sori_persistence::SqliteStore;
use sori_provider_whisper::{WhisperCppConfig, WhisperCppProvider};
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

    let mut config = DaemonConfig::default();
    if let Some(path) =
        std::env::var_os("SORI_DATABASE_PATH").or_else(|| std::env::var_os("SORI_DB_PATH"))
    {
        config.persistence_path = path.into();
    }
    config.validate().map_err(anyhow::Error::msg)?;
    let whisper_model =
        std::env::var("SORI_WHISPER_MODEL").unwrap_or_else(|_| "ggml-base.en.bin".into());
    let whisper_manifests = vec![ModelManifest {
        id: ModelId::from(whisper_model.as_str()),
        display_name: "Whisper.cpp local model".into(),
        language: "en".into(),
        backend: "whisper.cpp".into(),
        quantization: None,
        disk_size_bytes: None,
        ram_bytes: None,
        license: ModelLicense {
            name: "Whisper model license".into(),
            url: None,
            attribution: None,
        },
    }];
    let (whisper_provider, whisper_detail) = match WhisperCppConfig::discover() {
        Ok(config) => (
            Some(
                Arc::new(WhisperCppProvider::from_config(config, whisper_manifests))
                    as Arc<dyn sori_core::ModelProvider>,
            ),
            "whisper.cpp executable and model directory discovered".to_string(),
        ),
        Err(error) => (None, format!("unavailable: {error}")),
    };
    let store = Arc::new(SqliteStore::open(&config.persistence_path)?);
    if let Some(value) = store.setting("daemon.hotkey")? {
        if let Some(binding) = value.as_str() {
            config.hotkey.binding = binding.to_owned();
        }
    }
    if let Some(value) = store.setting("daemon.route")? {
        if let Ok(route) = serde_json::from_value(value) {
            config.route = route;
        }
    }
    let events = SharedEventBus(Arc::clone(&store));
    let mut daemon = match whisper_provider {
        Some(provider) => DaemonRuntime::new_with_provider(events, provider),
        None => DaemonRuntime::new(events),
    };
    match CpalAudioController::new(Default::default()) {
        Ok(audio) => daemon.set_audio_engine(Box::new(audio)),
        Err(error) => info!(detail = %error, "microphone adapter unavailable"),
    }
    let runtime = Arc::new(Mutex::new(daemon));
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
    let handler_config = Arc::new(Mutex::new(config.clone()));
    let server_task = server.serve(move |request| {
        let mut runtime = handler_runtime
            .lock()
            .map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?;
        let response = match request {
            Request::Status => Response::Status(status_response(&runtime, &*handler_config.lock().map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?)),
            Request::DictationStart => {
                runtime.start_audio().map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse { accepted: true, detail: "microphone capture started".into() })
            }
            Request::DictationStop => {
                let chunks = runtime.stop_audio(false).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse { accepted: true, detail: format!("microphone capture stopped after {chunks} chunks; no transcript was produced") })
            }
            Request::DictationCancel => {
                let chunks = runtime.stop_audio(true).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse { accepted: true, detail: format!("dictation cancelled after {chunks} chunks") })
            }
            Request::Dictation { model, audio } => Response::Transcript(
                runtime
                    .transcribe(&model, &audio)
                    .map_err(|error| sori_ipc::IpcError::Transport(error.to_string()))?,
            ),
            Request::Doctor => {
                let sqlite_ok = handler_store.migration_status().unwrap_or(false);
                Response::Doctor(DoctorResponse {
                    status: status_response(&runtime, &*handler_config.lock().map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?),
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
                        DoctorCheck {
                            name: "hotkey".into(),
                            ok: false,
                            detail: "unavailable: native global hotkey adapter is not wired".into(),
                        },
                        DoctorCheck {
                            name: "audio".into(),
                            ok: runtime.audio_available(),
                            detail: if runtime.audio_available() {
                                "CPAL adapter configured; permission and device are verified when a session starts".into()
                            } else {
                                "unavailable: CPAL microphone adapter could not be configured".into()
                            },
                        },
                        DoctorCheck {
                            name: "whisper".into(),
                            ok: runtime.whisper_available(),
                            detail: whisper_detail.clone(),
                        },
                        DoctorCheck {
                            name: "text-injection".into(),
                            ok: false,
                            detail: "unavailable: native text injection adapter is not wired"
                                .into(),
                        },
                    ],
                })
            }
            Request::ConfigSummary => Response::ConfigSummary(ConfigSummaryResponse {
                profile: ProfileMode::Basic,
                privacy: PrivacyMode::LocalOnly,
                history_enabled: true,
                hotkey: handler_config.lock().map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?.hotkey.binding.clone(),
                route: route_summary(&*handler_config.lock().map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?),
            }),
            Request::RecentHistory { limit } => Response::RecentHistory(RecentHistoryResponse {
                entries: handler_store.try_recent_history(usize::from(limit)).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?,
            }),
            Request::PurgeHistory => {
                handler_store.try_purge_history().map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse { accepted: true, detail: "history purged".into() })
            }
            Request::SetConfig { hotkey, route } => {
                if hotkey.trim().is_empty() { return Err(sori_ipc::IpcError::Transport("hotkey binding must not be empty".into())); }
                handler_store.set_setting("daemon.hotkey", &serde_json::json!(hotkey)).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                handler_store.set_setting("daemon.route", &serde_json::to_value(route).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                let mut config = handler_config.lock().map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?;
                config.hotkey.binding = hotkey;
                config.route = sori_core::RoutePolicy { prefer_local: route.prefer_local, allow_cloud: route.allow_cloud, prefer_warm_runtime: route.prefer_warm_runtime, optimize_battery: route.optimize_battery };
                Response::ConfigSummary(ConfigSummaryResponse { profile: ProfileMode::Basic, privacy: PrivacyMode::LocalOnly, history_enabled: true, hotkey: config.hotkey.binding.clone(), route })
            }
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

    let loop_result: Result<()> = tokio::select! {
        result = server_task => { result?; Ok(()) }
        signal = tokio::signal::ctrl_c() => { signal?; Ok(()) }
    };
    // Cleanup is deliberately performed even when the IPC server exits with an error.
    let mut runtime = runtime
        .lock()
        .map_err(|_| anyhow::anyhow!("runtime lock poisoned"))?;
    if !matches!(runtime.state(), RuntimeState::ShuttingDown) {
        runtime.shutdown()?;
    }
    loop_result?;
    if matches!(runtime.state(), RuntimeState::ShuttingDown) {
        info!("sorid stopped gracefully");
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
        capabilities: CapabilitySummary {
            audio_capture: runtime.audio_available(),
            whisper: runtime.whisper_available(),
            hotkey: false,
            text_injection: false,
            history: true,
        },
    }
}
