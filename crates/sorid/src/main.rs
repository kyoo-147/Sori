use anyhow::Result;
use sori_audio::CpalAudioController;
use sori_core::{ModelId, ModelLicense, ModelManifest, PrivacyMode, ProfileMode};
use sori_ipc::{
    ConfigSummaryResponse, ControlResponse, DEFAULT_ENDPOINT, DoctorCheck, DoctorResponse,
    IpcEvent, LocalIpcServer, PROTOCOL_VERSION, RecentEventsResponse, Request, Response,
    RouteSummary, RuntimeActivity, StatusResponse,
};
use sori_persistence::SqliteStore;
use sori_provider_whisper::{WhisperCppConfig, WhisperCppProvider};
use sorid::{
    DaemonConfig, DaemonRuntime, HotkeyService, HotkeyServiceStatus, RuntimeState, SharedEventBus,
    start_hotkey_service,
};
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
    let (whisper_provider, whisper_detail): (Option<Arc<dyn sori_core::ModelProvider>>, String) =
        match WhisperCppConfig::discover() {
            Ok(config) => {
                let provider = WhisperCppProvider::from_config(config, whisper_manifests);
                match provider.validate_for_transcription(&ModelId::from(whisper_model.as_str())) {
                    Ok(()) => (
                        Some(Arc::new(provider)),
                        "whisper.cpp executable and model are ready".into(),
                    ),
                    Err(error) => (None, format!("unavailable: {error}")),
                }
            }
            Err(error) => (None, format!("unavailable: {error}")),
        };
    let store = Arc::new(SqliteStore::open(&config.persistence_path)?);
    let events = SharedEventBus(Arc::clone(&store));
    let mut daemon = match whisper_provider {
        Some(provider) => DaemonRuntime::new_with_provider(events.clone(), provider),
        None => DaemonRuntime::new(events.clone()),
    };
    match CpalAudioController::new(config.audio.clone()) {
        Ok(audio) => daemon.set_audio_engine(Box::new(audio)),
        Err(error) => info!(detail = %error, "microphone adapter unavailable"),
    }
    daemon.publish_capability("asr", daemon.whisper_available(), whisper_detail.clone());
    let runtime = Arc::new(Mutex::new(daemon));
    let hotkey_runtime = Arc::clone(&runtime);
    let hotkey_model = ModelId::from(whisper_model.as_str());
    let hotkey_result: Result<(HotkeyService, HotkeyServiceStatus), _> = start_hotkey_service(
        Arc::new(events.clone()),
        sori_core::HotkeyCombination::new(1, 0x20),
        Arc::new(move |event| {
            if let Ok(mut runtime) = hotkey_runtime.lock() {
                runtime.handle_hotkey(event, &hotkey_model);
            }
        }),
    );
    let (_hotkey_service, hotkey_status) = match hotkey_result {
        Ok((service, status)) => (Some(service), status),
        Err(error) => {
            info!(detail = %error, "global hotkey adapter unavailable");
            (None, HotkeyServiceStatus::Unavailable(error.to_string()))
        }
    };
    let endpoint: SocketAddr = DEFAULT_ENDPOINT.parse().expect("valid IPC endpoint");
    let server = LocalIpcServer::bind(endpoint).await.map_err(|error| {
        anyhow::anyhow!(
            "cannot bind local IPC endpoint {endpoint}: {error}; another process may own it. {}",
            "Inspect with `Get-NetTCPConnection -LocalPort 17373` and stop only a known stale sorid process"
        )
    })?;
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
            Request::DictationStart => {
                runtime.start_audio().map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse { accepted: true, detail: "microphone capture started".into() })
            }
            Request::DictationStop => {
                let chunks = runtime.stop_audio(false).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Transcript(runtime.transcribe_captured(&ModelId::from(whisper_model.as_str()))
                    .map_err(|error| sori_ipc::IpcError::Transport(format!("capture stopped after {chunks} chunks but Whisper inference failed: {error}")))?)
            }
            Request::DictationCancel => {
                let chunks = runtime.stop_audio(true).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                let _ = runtime.take_captured_audio();
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
                        DoctorCheck {
                            name: "hotkey".into(),
                            ok: matches!(hotkey_status, HotkeyServiceStatus::Running),
                            detail: match &hotkey_status {
                                HotkeyServiceStatus::Running => "Windows global hotkey listener registered; physical key proof requires a machine test".into(),
                                HotkeyServiceStatus::Unsupported => "unsupported: native global hotkey adapter requires Windows".into(),
                                HotkeyServiceStatus::Unavailable(detail) => format!("unavailable: {detail}"),
                            },
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
                            ok: cfg!(windows),
                            detail: native_text_injection_detail().into(),
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

#[cfg(windows)]
fn native_text_injection_detail() -> &'static str {
    sori_core::WindowsSendInputAdapter::diagnostic()
}

#[cfg(not(windows))]
fn native_text_injection_detail() -> &'static str {
    "unavailable: Windows SendInput adapter is only available on Windows"
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
