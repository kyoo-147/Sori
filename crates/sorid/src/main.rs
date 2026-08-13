use anyhow::Result;
use sori_audio::CpalAudioController;
use sori_core::{
    FastIntent, HistoryEntry, HistoryRepository, ModelId, ModelLicense, ModelManifest, ModelRoute,
    PrivacyMode, ProfileMode, Vocabulary, VocabularyTerm,
};
use sori_ipc::{
    ConfigSummaryResponse, ControlResponse, DEFAULT_ENDPOINT, DoctorCheck, DoctorResponse,
    IpcEvent, LocalIpcServer, PROTOCOL_VERSION, RecentEventsResponse, RecentHistoryResponse,
    Request, Response, RouteSummary, RuntimeActivity, StatusResponse,
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
struct RuntimeTarget;
impl sori_core::TextTarget for RuntimeTarget {
    fn name(&self) -> &str {
        "foreground application"
    }
    fn capabilities(&self) -> sori_core::TextTargetCapabilities {
        sori_core::TextTargetCapabilities {
            accepts_text: true,
            supports_direct_input: cfg!(windows),
            supports_clipboard_paste: false,
            supports_undo: false,
            requires_elevation: false,
        }
    }
}
#[cfg(not(windows))]
struct UnavailableInjectionAdapter;
#[cfg(not(windows))]
impl sori_core::TextInjectionAdapter for UnavailableInjectionAdapter {
    fn send_direct_input(&mut self, _: &str) -> Result<(), String> {
        Err("Windows SendInput is unavailable on this host".into())
    }
    fn snapshot_clipboard(&mut self) -> Result<(), String> {
        Err("clipboard fallback is unavailable".into())
    }
    fn set_clipboard_text(&mut self, _: &str) -> Result<(), String> {
        Err("clipboard fallback is unavailable".into())
    }
    fn paste_from_clipboard(&mut self) -> Result<(), String> {
        Err("clipboard fallback is unavailable".into())
    }
    fn restore_clipboard(&mut self) -> Result<(), String> {
        Err("clipboard fallback is unavailable".into())
    }
    fn request_undo(&mut self) -> Result<(), String> {
        Err("undo is unavailable".into())
    }
}
struct RuntimeInjector {
    #[cfg(windows)]
    inner: sori_core::WindowsTextInjector<sori_core::WindowsSendInputAdapter>,
    #[cfg(not(windows))]
    inner: sori_core::AdapterTextInjector<UnavailableInjectionAdapter>,
}
impl RuntimeInjector {
    fn new() -> Self {
        Self {
            #[cfg(windows)]
            inner: sori_core::WindowsTextInjector::native(),
            #[cfg(not(windows))]
            inner: sori_core::AdapterTextInjector::new(
                UnavailableInjectionAdapter,
                sori_core::InjectorCapabilities {
                    direct_input: false,
                    clipboard: false,
                    clipboard_restore: false,
                    undo: false,
                },
            ),
        }
    }
}
impl sori_core::TextInjector for RuntimeInjector {
    fn capabilities(&self) -> sori_core::InjectorCapabilities {
        self.inner.capabilities()
    }
    fn plan(&self, target: &dyn sori_core::TextTarget) -> sori_core::InjectionPlan {
        self.inner.plan(target)
    }
    fn inject(
        &mut self,
        target: &dyn sori_core::TextTarget,
        request: &sori_core::TextInjectionRequest,
    ) -> Result<sori_core::TextInjectionResult, sori_core::TextInjectionError> {
        self.inner.inject(target, request)
    }
}
struct NoopHistory;
impl sori_core::HistoryRepository for NoopHistory {
    fn push(&self, _: sori_core::HistoryEntry) {}
    fn recent(&self, _: usize) -> Vec<sori_core::HistoryEntry> {
        Vec::new()
    }
    fn purge(&self) {}
}

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
    if let Some(value) = store.setting("hotkey.binding")? {
        if let Some(binding) = value.as_str() {
            config.hotkey.binding = binding.to_owned();
        }
    }
    let privacy_mode = store
        .setting("privacy.mode")?
        .and_then(|value| serde_json::from_value::<PrivacyMode>(value).ok())
        .unwrap_or(PrivacyMode::LocalOnly);
    let history_retention = store
        .setting("history.retention_limit")?
        .and_then(|v| v.as_u64())
        .unwrap_or(20) as usize;
    store.try_retain_history(history_retention)?;
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
    let hotkey = sorid::parse_hotkey_binding(&config.hotkey.binding).map_err(|error| {
        anyhow::anyhow!(
            "invalid configured hotkey `{}`: {error}",
            config.hotkey.binding
        )
    })?;
    let hotkey_result: Result<(HotkeyService, HotkeyServiceStatus), _> = start_hotkey_service(
        Arc::new(events.clone()),
        hotkey,
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
    let handler_config = Arc::new(Mutex::new(config.clone()));
    let handler_privacy = Arc::new(Mutex::new(privacy_mode));
    let server_task = server.serve(move |request| {
        let mut handler_config = handler_config
            .lock()
            .map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?;
        let mut runtime = handler_runtime
            .lock()
            .map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?;
        let mut privacy = handler_privacy
            .lock()
            .map_err(|_| sori_ipc::IpcError::Transport("privacy lock poisoned".into()))?;
        let response = match request {
            Request::Status => Response::Status(status_response(&runtime, &handler_config, *privacy)),
            Request::DictationStart => {
                runtime.start_audio().map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse { accepted: true, detail: "microphone capture started".into() })
            }
            Request::DictationStop => {
                let history_enabled = handler_store
                    .setting("history.enabled")
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let history_retention = handler_store
                    .setting("history.retention_limit")
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                    .and_then(|v| v.as_u64())
                    .unwrap_or(20) as usize;
                let chunks = runtime.stop_audio(false).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                let route = ModelRoute { provider: "whisper.cpp".into(), model: ModelId::from(whisper_model.as_str()), reason: "configured local route".into(), fallback: Vec::new() };
                let mut injector = RuntimeInjector::new();
                let target = RuntimeTarget;
                let no_history = NoopHistory;
                let history: &dyn HistoryRepository = if history_enabled { handler_store.as_ref() } else { &no_history };
                let vocabulary = handler_store.setting("resource.vocabulary").ok().flatten()
                    .and_then(|value| serde_json::from_value::<Vec<serde_json::Value>>(value).ok())
                    .map(|items| Vocabulary { terms: items.into_iter().filter_map(|item| Some(VocabularyTerm {
                        term: item.get("term")?.as_str()?.to_owned(),
                        pronunciation_hint: item.get("pronunciationHint").and_then(|v| v.as_str()).map(str::to_owned),
                        correction: item.get("correction").and_then(|v| v.as_str()).map(str::to_owned),
                    })).collect() }).unwrap_or_default();
                let result = runtime.complete_captured_dictation_with_vocabulary(&route, &mut injector, &target, history, &vocabulary)
                    .map_err(|error| sori_ipc::IpcError::Transport(format!("capture stopped after {chunks} chunks but canonical dictation pipeline failed: {error}")))?;
                if history_enabled { handler_store.try_retain_history(history_retention).map_err(|e| sori_ipc::IpcError::Transport(format!("history retention failed: {e}")))?; }
                Response::Transcript(result.transcript)
            }
            Request::DictationCancel => {
                let chunks = runtime.stop_audio(true).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                let _ = runtime.take_captured_audio();
                Response::Control(ControlResponse { accepted: true, detail: format!("dictation cancelled after {chunks} chunks") })
            }
            Request::Dictation { model, audio } => {
                let transcript = runtime
                    .transcribe(&model, &audio)
                    .map_err(|error| sori_ipc::IpcError::Transport(error.to_string()))?;
                let history_enabled = handler_store
                    .setting("history.enabled")
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                if history_enabled {
                    let entry = HistoryEntry { id: uuid::Uuid::new_v4(), at: time::OffsetDateTime::now_utc(), active_app: None, transcript: transcript.clone(), intent: FastIntent::Dictation { text: transcript.text.clone() }, route: None, inserted_text: None };
                    handler_store.try_push_history(&entry).map_err(|e| sori_ipc::IpcError::Transport(format!("transcript produced but history persistence failed: {e}")))?;
                    let retention = handler_store.setting("history.retention_limit").map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?.and_then(|v| v.as_u64()).unwrap_or(20) as usize;
                    handler_store.try_retain_history(retention).map_err(|e| sori_ipc::IpcError::Transport(format!("history retention failed: {e}")))?;
                }
                Response::Transcript(transcript)
            }
            Request::Doctor => {
                let sqlite_ok = handler_store.migration_status().unwrap_or(false);
                Response::Doctor(DoctorResponse {
                    status: status_response(&runtime, &handler_config, *privacy),
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
                            ok: runtime.audio_readiness().is_ok(),
                            detail: match runtime.audio_readiness() {
                                Ok(()) => "CPAL input device discovered and native input configuration is available; stream start remains a separate session check".into(),
                                Err(error) => format!("unavailable: {error}"),
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
            Request::ConfigSummary => {
                let history_enabled = handler_store
                    .setting("history.enabled")
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                Response::ConfigSummary(ConfigSummaryResponse {
                profile: ProfileMode::Basic,
                privacy: *privacy,
                history_enabled,
                hotkey: handler_config.hotkey.binding.clone(),
                route: route_summary(&handler_config),
                })
            }
            Request::RecentHistory { limit } => Response::RecentHistory(RecentHistoryResponse {
                entries: handler_store.try_recent_history(usize::from(limit)).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?,
            }),
            Request::ResourceGet { resource } => {
                validate_resource(&resource).map_err(sori_ipc::IpcError::Transport)?;
                let value = handler_store
                    .setting(&format!("resource.{resource}"))
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                    .unwrap_or_else(|| default_resource(&resource));
                Response::Resource(sori_ipc::ResourceResponse { resource, value })
            }
            Request::ResourceSet { resource, value } => {
                validate_resource(&resource).map_err(sori_ipc::IpcError::Transport)?;
                handler_store
                    .set_setting(&format!("resource.{resource}"), &value)
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Resource(sori_ipc::ResourceResponse { resource, value })
            }
            Request::PurgeHistory => {
                handler_store.try_purge_history().map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse { accepted: true, detail: "history purged from SQLite".into() })
            }
            Request::SetConfig { key, value } => {
                validate_setting(&key, &value).map_err(sori_ipc::IpcError::Transport)?;
                handler_store.set_setting(&key, &value).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                if key == "hotkey.binding" { handler_config.hotkey.binding = value.as_str().unwrap().to_owned(); }
                if key == "privacy.mode" { *privacy = serde_json::from_value(value).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?; }
                Response::Control(ControlResponse { accepted: true, detail: format!("setting {key} persisted") })
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
    privacy: PrivacyMode,
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
        privacy,
    }
}

fn validate_setting(key: &str, value: &serde_json::Value) -> Result<(), String> {
    match key {
        "hotkey.binding" if value.as_str().is_some_and(|v| !v.trim().is_empty()) => Ok(()),
        "history.enabled" if value.is_boolean() => Ok(()),
        "history.retention_limit" if value.as_u64().is_some_and(|v| v > 0 && v <= 10_000) => Ok(()),
        "privacy.mode"
            if value
                .as_str()
                .and_then(|v| serde_json::from_str::<PrivacyMode>(&format!("\"{v}\"")).ok())
                .is_some() =>
        {
            Ok(())
        }
        "hotkey.binding" => Err("hotkey.binding must be a non-empty string".into()),
        "history.enabled" => Err("history.enabled must be boolean".into()),
        "history.retention_limit" => {
            Err("history.retention_limit must be an integer from 1 to 10000".into())
        }
        "privacy.mode" => {
            Err("privacy.mode must be Auto, LocalOnly, CloudAllowed, or NeverCloud".into())
        }
        _ => Err(format!("unsupported setting: {key}")),
    }
}

fn validate_resource(resource: &str) -> Result<(), String> {
    match resource {
        "vocabulary" | "models" | "benchmarks" | "extensions" | "privacy" | "onboarding"
        | "route" => Ok(()),
        _ => Err(format!("unsupported resource: {resource}")),
    }
}

fn default_resource(resource: &str) -> serde_json::Value {
    match resource {
        "vocabulary" | "models" | "benchmarks" | "extensions" => serde_json::json!([]),
        "privacy" => {
            serde_json::json!({"saveTranscriptHistory": true, "retentionDays": 30, "ephemeralAudio": true, "voiceLock": "unknown", "commandPolicy": "ask-confirmation"})
        }
        "onboarding" => {
            serde_json::json!({"step": "welcome", "completed": false, "microphone": "unknown", "permissions": "unknown", "hotkey": "unknown"})
        }
        "route" => {
            serde_json::json!({"prefer_local": true, "allow_cloud": false, "prefer_warm_runtime": false, "optimize_battery": false})
        }
        _ => serde_json::Value::Null,
    }
}
