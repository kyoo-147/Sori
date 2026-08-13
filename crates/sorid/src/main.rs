use anyhow::Result;
use sori_audio::CpalAudioController;
use sori_core::{
    BenchmarkInput, FastIntent, HistoryEntry, HistoryRepository, ModelId, ModelLicense,
    ModelManifest, ModelRoute, PrivacyMode, ProfileMode, Vocabulary, VocabularyTerm, run_benchmark,
};
use sori_ipc::{
    ConfigSummaryResponse, ControlResponse, DEFAULT_ENDPOINT, DoctorCheck, DoctorResponse,
    ExtensionManifest, ExtensionRecord, ExtensionsResponse, IpcEvent, LocalIpcServer,
    PROTOCOL_VERSION, RecentEventsResponse, RecentHistoryResponse, Request, Response, RouteSummary,
    RuntimeActivity, StatusResponse,
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
            supports_clipboard_paste: true,
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
    if let Some(value) = store.setting("route.policy")? {
        if let Ok(preset) = serde_json::from_value::<sori_core::RoutePreset>(value) {
            config.route = preset.policy();
        }
    }
    let benchmark_provider = whisper_provider.clone();
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
    let hotkey_model = store
        .setting("resource.route")?
        .and_then(|value| {
            value
                .get("activeModelId")
                .and_then(|id| id.as_str())
                .map(ModelId::from)
        })
        .unwrap_or_else(|| ModelId::from(whisper_model.as_str()));
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
            Request::ExtensionsList => Response::Extensions(ExtensionsResponse {
                extensions: handler_store.extensions().map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?.into_iter().map(extension_record).collect(),
            }),
            Request::ExtensionInstall { manifest } => {
                validate_extension_manifest(&manifest).map_err(sori_ipc::IpcError::Transport)?;
                let value = serde_json::to_value(&manifest).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                handler_store.save_extension(&manifest.id, &value, "disabled", None).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse { accepted: true, detail: format!("extension {} installed and disabled; execution requires the sandbox host", manifest.id) })
            }
            Request::ExtensionEnable { id } => extension_state(&handler_store, &id, "enabled")?,
            Request::ExtensionDisable { id } => extension_state(&handler_store, &id, "disabled")?,
            Request::ExtensionUninstall { id } => {
                let removed = handler_store.delete_extension(&id).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                if removed { Response::Control(ControlResponse { accepted: true, detail: format!("extension {id} uninstalled") }) }
                else { Response::Error(sori_ipc::IpcErrorResponse { code: "not_found".into(), detail: format!("extension {id} is not installed") }) }
            }
            Request::ExtensionInvoke { id, command, .. } => Response::Error(sori_ipc::IpcErrorResponse {
                code: "execution_unavailable".into(),
                detail: format!("extension {id} command {command} was not executed: isolated extension host is not installed"),
            }),
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
                let route_config = handler_store.setting("resource.route").map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?.unwrap_or_else(|| default_resource("route"));
                let selected_model = route_config.get("activeModelId").and_then(|id| id.as_str()).unwrap_or(whisper_model.as_str());
                let fallback = route_config.get("fallbackModelIds").and_then(|ids| ids.as_array()).map(|ids| ids.iter().filter_map(|id| id.as_str().map(ModelId::from)).collect()).unwrap_or_default();
                let route = ModelRoute { provider: "whisper.cpp".into(), model: ModelId::from(selected_model), reason: format!("{} policy", route_config.get("policy").and_then(|p| p.as_str()).unwrap_or("LocalFirst")), fallback };
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
            Request::VoiceEdit { selection, instruction, approved } => {
                if !approved {
                    sori_core::voice_edit::preview(&selection, &instruction)
                        .map(Response::VoiceEdit)
                        .map_err(|error| sori_ipc::IpcError::Transport(format!("voice edit preview unavailable: {error}")))?
                } else {
                    Response::Error(sori_ipc::IpcErrorResponse {
                        code: "voice_edit_target_unavailable".into(),
                        detail: "Voice Edit approval is unavailable until sorid captures and revalidates the native focused selection; no replacement was performed".into(),
                    })
                }
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
            Request::RunBenchmark { model, audio, reference, iterations } => {
                let provider = benchmark_provider.as_ref().ok_or_else(|| sori_ipc::IpcError::Transport("benchmark unavailable: Whisper provider is not ready".into()))?;
                let result = run_benchmark(provider.as_ref(), &BenchmarkInput { model, audio, reference, iterations: usize::from(iterations) }).map_err(|e| sori_ipc::IpcError::Transport(format!("benchmark failed: {e}")))?;
                handler_store.save_benchmark(&result).map_err(|e| sori_ipc::IpcError::Transport(format!("benchmark persistence failed: {e}")))?;
                Response::Benchmark(result)
            }
            Request::RecentBenchmarks { limit } => Response::Resource(sori_ipc::ResourceResponse {
                resource: "benchmarks".into(),
                value: serde_json::to_value(handler_store.recent_benchmarks(usize::from(limit)).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?,
            }),
            Request::ApplyBenchmarkRecommendation { model } => {
                let route = serde_json::json!({"provider":"whisper.cpp","model":model,"reason":"recommended by persisted benchmark","fallback":[]});
                handler_store.save_model_route("recommended", &route).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse { accepted: true, detail: format!("benchmark recommendation persisted for {}", model.0) })
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
                if key == "privacy.mode" { *privacy = serde_json::from_value(value.clone()).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?; }
                if key == "route.policy" { let preset: sori_core::RoutePreset = serde_json::from_value(value.clone()).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?; handler_config.route = preset.policy(); }
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

fn validate_extension_manifest(manifest: &ExtensionManifest) -> std::result::Result<(), String> {
    let id_ok = !manifest.id.is_empty()
        && manifest.id.len() <= 64
        && manifest
            .id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_');
    if !id_ok {
        return Err(
            "extension id must be lowercase ASCII and contain only letters, digits, '-' or '_'"
                .into(),
        );
    }
    if manifest.name.trim().is_empty() || manifest.version.trim().is_empty() {
        return Err("extension name and version are required".into());
    }
    if manifest.entrypoint.is_empty()
        || std::path::Path::new(&manifest.entrypoint).is_absolute()
        || manifest
            .entrypoint
            .split(['/', '\\'])
            .any(|part| part == "..")
    {
        return Err("entrypoint must be a relative path without traversal".into());
    }
    const ALLOWED: &[&str] = &[
        "network",
        "filesystem.read",
        "filesystem.write",
        "shell",
        "dictation",
        "events",
    ];
    if let Some(permission) = manifest
        .permissions
        .iter()
        .find(|permission| !ALLOWED.contains(&permission.as_str()))
    {
        return Err(format!("unsupported extension permission: {permission}"));
    }
    if manifest.license.trim().is_empty() {
        return Err("license evidence is required".into());
    }
    Ok(())
}

fn extension_record(
    row: (String, serde_json::Value, String, i64, i64, Option<String>),
) -> ExtensionRecord {
    let (_id, manifest, state, installed_at, updated_at, last_error) = row;
    ExtensionRecord {
        manifest: serde_json::from_value(manifest).expect("validated extension manifest in SQLite"),
        state,
        installed_at,
        updated_at,
        last_error,
    }
}

fn extension_state(
    store: &SqliteStore,
    id: &str,
    state: &str,
) -> std::result::Result<Response, sori_ipc::IpcError> {
    let Some((manifest, _, _, _, _)) = store
        .extension(id)
        .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
    else {
        return Ok(Response::Error(sori_ipc::IpcErrorResponse {
            code: "not_found".into(),
            detail: format!("extension {id} is not installed"),
        }));
    };
    store
        .save_extension(id, &manifest, state, None)
        .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
    Ok(Response::Control(ControlResponse {
        accepted: true,
        detail: format!("extension {id} {state}"),
    }))
}

#[cfg(windows)]
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
        "route.policy"
            if value
                .as_str()
                .and_then(|v| {
                    serde_json::from_str::<sori_core::RoutePreset>(&format!("\"{v}\"")).ok()
                })
                .is_some() =>
        {
            Ok(())
        }
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
        "route.policy" => Err("route.policy must be a supported route preset".into()),
        "privacy.mode" => {
            Err("privacy.mode must be Auto, LocalOnly, CloudAllowed, or NeverCloud".into())
        }
        _ => Err(format!("unsupported setting: {key}")),
    }
}

fn validate_resource(resource: &str) -> Result<(), String> {
    match resource {
        "vocabulary" | "models" | "benchmarks" | "extensions" | "permissions" | "privacy"
        | "onboarding" | "route" => Ok(()),
        _ => Err(format!("unsupported resource: {resource}")),
    }
}

fn default_resource(resource: &str) -> serde_json::Value {
    match resource {
        "vocabulary" | "benchmarks" | "extensions" | "permissions" => serde_json::json!([]),
        "models" => {
            serde_json::json!([{"id":"whisper.cpp/ggml-base.en","name":"Whisper base.en","provider":"whisper.cpp","location":"local","qualityTier":"standard","recommended":true,"available":false,"unavailableReason":"UNVERIFIED: local model files have not been configured"}])
        }
        "privacy" => {
            serde_json::json!({"saveTranscriptHistory": true, "retentionDays": 30, "ephemeralAudio": true, "voiceLock": "unknown", "commandPolicy": "ask-confirmation"})
        }
        "onboarding" => {
            serde_json::json!({"step": "welcome", "completed": false, "microphone": "unknown", "permissions": "unknown", "hotkey": "unknown"})
        }
        "route" => {
            serde_json::json!({"activeModelId":"whisper.cpp/ggml-base.en","policy":"LocalFirst","fallbackModelIds":[]})
        }
        _ => serde_json::Value::Null,
    }
}
