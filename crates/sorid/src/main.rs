use anyhow::Result;
use sori_audio::CpalAudioController;
use sori_core::{
    BenchmarkInput, BenchmarkOptions, CancellationToken, FastIntent, HistoryEntry,
    HistoryRepository, ModelId, ModelRoute, PrivacyMode, ProfileMode, Vocabulary, VocabularyTerm,
    recommend_benchmark, run_benchmark_with_options,
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
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tracing::info;
struct RuntimeTarget {
    identity: Option<String>,
}
impl RuntimeTarget {
    fn capture() -> Result<Self, String> {
        #[cfg(windows)]
        {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                GetForegroundWindow, GetWindowThreadProcessId,
            };
            let hwnd = unsafe { GetForegroundWindow() };
            if hwnd.is_null() {
                return Err("no foreground window is available for text insertion".into());
            }
            let mut pid = 0;
            unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
            if pid == 0 {
                return Err("foreground window has no owning process".into());
            }
            return Ok(Self {
                identity: Some(format!("pid:{pid};hwnd:{:x}", hwnd as usize)),
            });
        }
        #[cfg(not(windows))]
        {
            Ok(Self { identity: None })
        }
    }
}
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
    fn identity(&self) -> Option<&str> {
        self.identity.as_deref()
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
    let (whisper_provider, whisper_detail): (Option<Arc<dyn sori_core::ModelProvider>>, String) =
        match WhisperCppConfig::discover() {
            Ok(config) => {
                let provider = WhisperCppProvider::from_config(config, Vec::new());
                match provider.discover_models() {
                    Ok(manifests) => {
                        let count = manifests.len();
                        let provider = WhisperCppProvider::from_config(
                            WhisperCppConfig::new(
                                provider.executable().to_path_buf(),
                                provider.model_dir().map(std::path::Path::to_path_buf),
                            ),
                            manifests,
                        );
                        (
                            Some(Arc::new(provider)),
                            format!(
                                "whisper.cpp executable configured; discovered {count} model(s)"
                            ),
                        )
                    }
                    Err(error) => (None, format!("unavailable: {error}")),
                }
            }
            Err(error) => (None, format!("unavailable: {error}")),
        };
    let store = Arc::new(SqliteStore::open(&config.persistence_path)?);
    // Promote FE settings into daemon keys before runtime construction so a
    // restart preserves the same canonical hotkey configuration.
    if let Some(settings) = store.resource("settings")? {
        if let Some(binding) = settings.get("hotkey").and_then(|value| value.as_str()) {
            store.set_setting("hotkey.binding", &serde_json::json!(binding))?;
        }
    }
    if let Some(value) = store.setting("route.policy")? {
        if let Ok(preset) = serde_json::from_value::<sori_core::RoutePreset>(value) {
            config.route = preset.policy();
        }
    }
    if let Some(route) = store
        .resource("route")?
        .or(store.setting("resource.route")?)
    {
        let valid = whisper_provider.as_ref().is_some_and(|provider| {
            route
                .get("activeModelId")
                .and_then(|value| value.as_str())
                .is_some_and(|active| {
                    let model = active.strip_prefix("whisper.cpp/").unwrap_or(active);
                    provider.can_transcribe(&ModelId::from(model))
                })
        });
        if !valid {
            let empty_route = serde_json::json!({"activeModelId": null, "policy": "LocalFirst", "fallbackModelIds": []});
            store.set_setting("resource.route", &empty_route)?;
            store.set_resource("route", &empty_route)?;
        }
    }
    let benchmark_provider = whisper_provider.clone();
    let model_provider = whisper_provider.clone();
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
    let runtime = Arc::new(Mutex::new(Some(daemon)));
    let hotkey_runtime = Arc::clone(&runtime);
    let hotkey_model = store
        .resource("route")?
        .or(store.setting("resource.route")?)
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
            if let Ok(mut slot) = hotkey_runtime.lock() {
                if let Some(mut runtime) = slot.take() {
                    drop(slot);
                    runtime.handle_hotkey(event, &hotkey_model);
                    if let Ok(mut slot) = hotkey_runtime.lock() {
                        *slot = Some(runtime);
                    }
                }
            }
        }),
    );
    let (hotkey_service, hotkey_status) = match hotkey_result {
        Ok((service, status)) => (Some(service), status),
        Err(error) => {
            info!(detail = %error, "global hotkey adapter unavailable");
            (None, HotkeyServiceStatus::Unavailable(error.to_string()))
        }
    };
    let hotkey_service = Arc::new(Mutex::new(hotkey_service));
    let hotkey_status = Arc::new(Mutex::new(hotkey_status));
    let endpoint: SocketAddr = std::env::var("SORI_IPC_ADDR")
        .unwrap_or_else(|_| DEFAULT_ENDPOINT.to_owned())
        .parse()
        .map_err(|error| anyhow::anyhow!("invalid SORI_IPC_ADDR: {error}"))?;
    if !endpoint.ip().is_loopback() {
        return Err(anyhow::anyhow!("SORI_IPC_ADDR must be a loopback address"));
    }
    let server = LocalIpcServer::bind(endpoint).await.map_err(|error| {
        anyhow::anyhow!(
            "cannot bind local IPC endpoint {endpoint}: {error}; another process may own it. {}",
            "Inspect the endpoint and stop only a known stale sorid process"
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
    let handler_hotkey_service = Arc::clone(&hotkey_service);
    let handler_hotkey_status = Arc::clone(&hotkey_status);
    let handler_privacy = Arc::new(Mutex::new(privacy_mode));
    let handler_model_provider = model_provider.clone();
    let benchmark_sessions: Arc<Mutex<HashMap<uuid::Uuid, CancellationToken>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let handler_benchmark_sessions = Arc::clone(&benchmark_sessions);
    let dictation_cancellation: Arc<Mutex<Option<CancellationToken>>> = Arc::new(Mutex::new(None));
    let handler_dictation_cancellation = Arc::clone(&dictation_cancellation);
    let server_task = server.serve(move |request| {
        let config_snapshot = handler_config
            .lock()
            .map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?
            .clone();
        let privacy = *handler_privacy
            .lock()
            .map_err(|_| sori_ipc::IpcError::Transport("privacy lock poisoned".into()))?;
        let response = match request {
            Request::Models => match handler_model_provider.as_ref() {
                Some(provider) => {
                    let models = provider.manifests().iter().map(|manifest| sori_ipc::ModelRecord {
                        manifest: manifest.clone(), status: provider.runtime_status(&manifest.id),
                    }).collect::<Vec<_>>();
                    let available = !models.is_empty();
                    Response::Models(sori_ipc::ModelsResponse {
                        provider: Some(provider.provider_name().into()), available,
                        models, error: if !available { Some("no installed whisper.cpp models were discovered".into()) } else { None },
                    })
                }
                None => Response::Models(sori_ipc::ModelsResponse {
                    provider: None, available: false, models: Vec::new(), error: Some(whisper_detail.clone()),
                }),
            },
            Request::ModelStatus { model } => {
                let provider = handler_model_provider.as_ref().ok_or_else(|| sori_ipc::IpcError::Transport(whisper_detail.clone()))?;
                if !provider.can_transcribe(&model) {
                    Response::Error(sori_ipc::IpcErrorResponse { code: "model_unavailable".into(), detail: format!("model is not discovered and ready: {}", model.0) })
                } else {
                    Response::ModelStatus(sori_ipc::ModelStatusResponse { provider: provider.provider_name().into(), status: provider.runtime_status(&model) })
                }
            }
            Request::ModelLoad { model } => {
                let provider = handler_model_provider.as_ref().ok_or_else(|| sori_ipc::IpcError::Transport(whisper_detail.clone()))?;
                if !provider.can_transcribe(&model) {
                    Response::Error(sori_ipc::IpcErrorResponse { code: "model_unavailable".into(), detail: format!("cannot load unavailable model: {}", model.0) })
                } else {
                    provider.load(&model).map_err(|error| sori_ipc::IpcError::Transport(format!("model load failed: {error}")))?;
                    Response::ModelStatus(sori_ipc::ModelStatusResponse { provider: provider.provider_name().into(), status: provider.runtime_status(&model) })
                }
            }
            Request::ModelWarm { model } => {
                let provider = handler_model_provider.as_ref().ok_or_else(|| sori_ipc::IpcError::Transport(whisper_detail.clone()))?;
                if !provider.can_transcribe(&model) {
                    Response::Error(sori_ipc::IpcErrorResponse { code: "model_unavailable".into(), detail: format!("cannot warm unavailable model: {}", model.0) })
                } else {
                    provider.warm(&model).map_err(|error| sori_ipc::IpcError::Transport(format!("model warm failed: {error}")))?;
                    Response::ModelStatus(sori_ipc::ModelStatusResponse { provider: provider.provider_name().into(), status: provider.runtime_status(&model) })
                }
            }
            Request::ModelUnload { model } => {
                let provider = handler_model_provider.as_ref().ok_or_else(|| sori_ipc::IpcError::Transport(whisper_detail.clone()))?;
                if !provider.can_transcribe(&model) {
                    Response::Error(sori_ipc::IpcErrorResponse { code: "model_unavailable".into(), detail: format!("cannot unload unavailable model: {}", model.0) })
                } else {
                    provider.unload(&model).map_err(|error| sori_ipc::IpcError::Transport(format!("model unload failed: {error}")))?;
                    Response::ModelStatus(sori_ipc::ModelStatusResponse { provider: provider.provider_name().into(), status: provider.runtime_status(&model) })
                }
            }
            Request::ModelInstall { model, source, expected_sha256 } => {
                let Some(provider) = handler_model_provider.as_ref() else {
                    return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "model_provider_unavailable".into(), detail: whisper_detail.clone() }));
                };
                provider.install_model_from_file(&model, std::path::Path::new(&source), &expected_sha256)
                    .map_err(|error| sori_ipc::IpcError::Transport(format!("model install failed: {error}")))?;
                let manifest = provider.manifests().into_iter().find(|manifest| manifest.id == model)
                    .ok_or_else(|| sori_ipc::IpcError::Transport("model install succeeded but registry did not expose the model".into()))?;
                handler_store.save_model_manifest(&model.0, &serde_json::to_value(&manifest).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?)
                    .map_err(|e| sori_ipc::IpcError::Transport(format!("model manifest persistence failed: {e}")))?;
                Response::ModelStatus(sori_ipc::ModelStatusResponse { provider: provider.provider_name().into(), status: provider.runtime_status(&model) })
            }
            Request::ModelRemove { model } => {
                let Some(provider) = handler_model_provider.as_ref() else {
                    return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "model_provider_unavailable".into(), detail: whisper_detail.clone() }));
                };
                let route = handler_store.setting("resource.route").map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                let active = route.as_ref().and_then(|value| value.get("activeModelId")).and_then(|value| value.as_str()).unwrap_or_default();
                if active == model.0 || active == format!("{}/{}", provider.provider_name(), model.0) {
                    Response::Error(sori_ipc::IpcErrorResponse { code: "model_in_use".into(), detail: format!("cannot remove model {} because it is the active route", model.0) })
                } else {
                    provider.remove_model(&model).map_err(|error| sori_ipc::IpcError::Transport(format!("model removal failed: {error}")))?;
                    handler_store.delete_model_manifest(&model.0).map_err(|error| sori_ipc::IpcError::Transport(format!("model manifest removal failed: {error}")))?;
                    Response::ModelStatus(sori_ipc::ModelStatusResponse { provider: provider.provider_name().into(), status: provider.runtime_status(&model) })
                }
            }
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
            Request::Status => {
                let slot = handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?;
                Response::Status(slot.as_ref().map(|runtime| status_response(runtime, &config_snapshot, privacy)).unwrap_or_else(|| busy_status_response(&config_snapshot, privacy)))
            }
            Request::DictationStart => {
                let cancellation = CancellationToken::new();
                *handler_dictation_cancellation.lock().map_err(|_| sori_ipc::IpcError::Transport("dictation cancellation lock poisoned".into()))? = Some(cancellation.clone());
                let mut runtime = handler_runtime
                    .lock()
                    .map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?
                    .take()
                    .ok_or_else(|| sori_ipc::IpcError::Transport("runtime operation in progress".into()))?;
                if let Err(error) = runtime.start_audio() {
                    handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?.replace(runtime);
                    *handler_dictation_cancellation.lock().map_err(|_| sori_ipc::IpcError::Transport("dictation cancellation lock poisoned".into()))? = None;
                    return Err(sori_ipc::IpcError::Transport(error.to_string()));
                }
                if cancellation.is_cancelled() {
                    let _ = runtime.stop_audio(true);
                    handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?.replace(runtime);
                    *handler_dictation_cancellation.lock().map_err(|_| sori_ipc::IpcError::Transport("dictation cancellation lock poisoned".into()))? = None;
                    return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "dictation_cancelled".into(), detail: "dictation was cancelled while microphone capture was starting".into() }));
                }
                handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?.replace(runtime);
                Response::Control(ControlResponse { accepted: true, detail: "microphone capture started".into() })
            }
            Request::DictationStop => {
                let mut slot = handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?;
                let mut runtime = slot.take().ok_or_else(|| sori_ipc::IpcError::Transport("runtime operation in progress".into()))?;
                drop(slot);
                let operation: std::result::Result<Response, sori_ipc::IpcError> = std::panic::catch_unwind(
                    std::panic::AssertUnwindSafe(|| (|| {
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
                let (sample_count, sample_rate, peak, rms) = runtime.captured_audio_stats();
                info!(chunks, sample_count, sample_rate, peak, rms, "captured audio diagnostics");
                if let Some(path) = std::env::var_os("SORI_CAPTURE_DEBUG_WAV") {
                    let wav = sori_provider_whisper::encode_wav(runtime.captured_audio())
                        .map_err(|error| sori_ipc::IpcError::Transport(format!("capture diagnostics WAV encoding failed: {error}")))?;
                    std::fs::write(&path, wav)
                        .map_err(|error| sori_ipc::IpcError::Transport(format!("capture diagnostics WAV write failed ({}): {error}", path.to_string_lossy())))?;
                    info!(path = %path.to_string_lossy(), "wrote captured audio diagnostics WAV");
                }
                if peak < 0.005 {
                    tracing::warn!(sample_count, sample_rate, peak, rms, "captured signal is below audibility diagnostic threshold");
                    Ok(Response::Error(sori_ipc::IpcErrorResponse {
                        code: "capture_signal_unavailable".into(),
                        detail: format!("captured signal is below audibility threshold: samples={sample_count}, rate={sample_rate}, peak={peak:.9}, rms={rms:.9}; verify the selected microphone and Windows permission"),
                    }))
                } else {
                let route_config = handler_store.resource("route").map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?.or(handler_store.setting("resource.route").map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?).unwrap_or_else(|| default_resource("route"));
                let selected_model = route_config.get("activeModelId").and_then(|id| id.as_str()).unwrap_or(whisper_model.as_str());
                let selected_model = selected_model.strip_prefix("whisper.cpp/").unwrap_or(selected_model);
                let selected_model = if selected_model == "ggml-base.en" && whisper_model != "ggml-base.en" { whisper_model.as_str() } else { selected_model };
                let fallback = route_config.get("fallbackModelIds").and_then(|ids| ids.as_array()).map(|ids| ids.iter().filter_map(|id| id.as_str().map(|id| ModelId::from(id.strip_prefix("whisper.cpp/").unwrap_or(id)))).collect()).unwrap_or_default();
                let route = ModelRoute { provider: "whisper.cpp".into(), model: ModelId::from(selected_model), reason: format!("{} policy", route_config.get("policy").and_then(|p| p.as_str()).unwrap_or("LocalFirst")), fallback };
                let mut injector = RuntimeInjector::new();
                let target = RuntimeTarget::capture()
                    .map_err(|error| sori_ipc::IpcError::Transport(format!("focused target unavailable: {error}")))?;
                let no_history = NoopHistory;
                let history: &dyn HistoryRepository = if history_enabled { handler_store.as_ref() } else { &no_history };
                let vocabulary = handler_store.resource("vocabulary").ok().flatten().or_else(|| handler_store.setting("resource.vocabulary").ok().flatten())
                    .and_then(|value| serde_json::from_value::<Vec<serde_json::Value>>(value).ok())
                    .map(|items| Vocabulary { terms: items.into_iter().filter_map(|item| Some(VocabularyTerm {
                        term: item.get("term")?.as_str()?.to_owned(),
                        pronunciation_hint: item.get("pronunciationHint").and_then(|v| v.as_str()).map(str::to_owned),
                        correction: item.get("correction").and_then(|v| v.as_str()).map(str::to_owned),
                    })).collect() }).unwrap_or_default();
                // Bound native provider work so a stuck whisper child is killed by
                // its runner and this IPC operation cannot publish a late result.
                let cancellation = handler_dictation_cancellation.lock().map_err(|_| sori_ipc::IpcError::Transport("dictation cancellation lock poisoned".into()))?.clone().unwrap_or_else(CancellationToken::new);
                let timeout_token = cancellation.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(30));
                    timeout_token.cancel();
                });
                let result = match runtime.complete_captured_dictation_with_options(
                    &route, &mut injector, &target, history, &vocabulary,
                    &cancellation, Some(std::time::Duration::from_secs(30)),
                ) {
                    Ok(result) => result,
                    Err(sori_core::PipelineError::Route(detail)) => {
                        return Ok(Response::Error(sori_ipc::IpcErrorResponse {
                            code: "model_unavailable".into(),
                            detail: format!("capture stopped after {chunks} chunks: {detail}"),
                        }));
                    }
                    Err(error) => return Err(sori_ipc::IpcError::Transport(format!(
                        "capture stopped after {chunks} chunks but canonical dictation pipeline failed: {error}"
                    ))),
                };
                if history_enabled { handler_store.try_retain_history(history_retention).map_err(|e| sori_ipc::IpcError::Transport(format!("history retention failed: {e}")))?; }
                Ok(Response::Transcript(result.transcript))
                }
                    })(),
                ))
                .unwrap_or_else(|_| Err(sori_ipc::IpcError::Transport(
                    "provider panicked; dictation state was reset".into(),
                )));
                *handler_dictation_cancellation.lock().map_err(|_| sori_ipc::IpcError::Transport("dictation cancellation lock poisoned".into()))? = None;
                handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?.replace(runtime);
                operation?
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
                let cancellation = handler_dictation_cancellation.lock().map_err(|_| sori_ipc::IpcError::Transport("dictation cancellation lock poisoned".into()))?.clone().ok_or_else(|| sori_ipc::IpcError::Transport("no dictation session is active".into()))?;
                cancellation.cancel();
                // Provider work owns the runtime slot. The token makes that
                // work terminate without waiting on the runtime mutex.
                if let Ok(mut slot) = handler_runtime.try_lock() {
                    if let Some(runtime) = slot.as_mut() {
                        if let Ok(chunks) = runtime.stop_audio(true) {
                            let _ = runtime.take_captured_audio();
                            *handler_dictation_cancellation.lock().map_err(|_| sori_ipc::IpcError::Transport("dictation cancellation lock poisoned".into()))? = None;
                            return Ok(Response::Control(ControlResponse { accepted: true, detail: format!("dictation cancelled after {chunks} chunks") }));
                        }
                    }
                }
                Response::Control(ControlResponse { accepted: true, detail: "dictation cancellation requested; active provider work will be discarded".into() })
            }
            Request::Dictation { model, audio } => {
                let slot = handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?;
                let runtime = slot.as_ref().ok_or_else(|| sori_ipc::IpcError::Transport("runtime operation in progress".into()))?;
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
            Request::CancelBenchmark { session_id } => {
                let token = handler_benchmark_sessions.lock().map_err(|_| sori_ipc::IpcError::Transport("benchmark session lock poisoned".into()))?.get(&session_id).cloned();
                match token { Some(token) => { token.cancel(); Response::Control(ControlResponse { accepted: true, detail: "benchmark cancellation requested".into() }) }, None => Response::Error(sori_ipc::IpcErrorResponse { code: "benchmark_session_not_found".into(), detail: "benchmark session is not active".into() }) }
            }
            Request::RunBenchmark { model, audio, reference, iterations, session_id, timeout_ms } => {
                let provider = benchmark_provider.as_ref().ok_or_else(|| sori_ipc::IpcError::Transport("benchmark unavailable: Whisper provider is not ready".into()))?;
                let session_id = session_id.unwrap_or_else(uuid::Uuid::new_v4);
                let cancellation = CancellationToken::new();
                handler_benchmark_sessions.lock().map_err(|_| sori_ipc::IpcError::Transport("benchmark session lock poisoned".into()))?.insert(session_id, cancellation.clone());
                if let Some(timeout_ms) = timeout_ms { let timer = cancellation.clone(); std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_millis(timeout_ms)); timer.cancel(); }); }
                let result = run_benchmark_with_options(provider.as_ref(), &BenchmarkInput { model, audio, reference, iterations: usize::from(iterations) }, &BenchmarkOptions { cancellation: cancellation.clone(), timeout: timeout_ms.map(std::time::Duration::from_millis) });
                handler_benchmark_sessions.lock().map_err(|_| sori_ipc::IpcError::Transport("benchmark session lock poisoned".into()))?.remove(&session_id);
                let result = result.map_err(|e| sori_ipc::IpcError::Transport(format!("benchmark failed: {e}")))?;
                handler_store.save_benchmark(&result).map_err(|e| sori_ipc::IpcError::Transport(format!("benchmark persistence failed: {e}")))?;
                Response::Benchmark(result)
            }
            Request::RecentBenchmarks { limit } => {
                let runs = handler_store.recent_benchmarks(usize::from(limit)).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                let recommendation = recommend_benchmark(&runs).map(|result| serde_json::json!({
                    "run_id": result.run_id,
                    "provider": result.provider,
                    "model": result.model,
                }));
                Response::Resource(sori_ipc::ResourceResponse {
                    resource: "benchmarks".into(),
                    value: serde_json::json!({ "runs": runs, "recommendation": recommendation }),
                })
            }
            Request::ApplyBenchmarkRecommendation { model } => {
                let provider = benchmark_provider.as_ref().ok_or_else(|| sori_ipc::IpcError::Transport("benchmark recommendation unavailable: Whisper provider is not ready".into()))?;
                let runs = handler_store.recent_benchmarks(usize::MAX).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                let selected = recommend_benchmark(&runs).ok_or_else(|| sori_ipc::IpcError::Transport("benchmark recommendation unavailable: no successful benchmark runs".into()))?;
                if let Some(requested) = model {
                    if requested != selected.model { return Err(sori_ipc::IpcError::Transport("requested model is not the backend-selected benchmark recommendation".into())); }
                }
                let route = validated_benchmark_route(&selected.model, provider.as_ref()).map_err(sori_ipc::IpcError::Transport)?;
                handler_store.set_resource("route", &route).map_err(|e| sori_ipc::IpcError::Transport(format!("benchmark recommendation persistence failed: {e}")))?;
                handler_store.set_setting("resource.route", &route).map_err(|e| sori_ipc::IpcError::Transport(format!("benchmark recommendation compatibility persistence failed: {e}")))?;
                Response::Resource(sori_ipc::ResourceResponse { resource: "route".into(), value: route })
            }
            Request::Doctor => {
                let slot = handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?;
                let sqlite_ok = handler_store.migration_status().unwrap_or(false);
                let status = slot.as_ref().map(|runtime| status_response(runtime, &config_snapshot, privacy)).unwrap_or_else(|| busy_status_response(&config_snapshot, privacy));
                let audio_error = slot.as_ref().and_then(|runtime| runtime.audio_readiness().err()).map(|error| error.to_string());
                let whisper_ready = slot.as_ref().is_some_and(|runtime| runtime.whisper_available());
                Response::Doctor(DoctorResponse {
                    status,
                    checks: vec![
                        DoctorCheck {
                            name: "daemon".into(),
                            ok: true,
                            detail: "sorid is reachable over loopback".into(),
                        },
                        DoctorCheck {
                            name: "ipc-bind".into(),
                            ok: true,
                            detail: format!("bound to {endpoint}"),
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
                            ok: matches!(*hotkey_status.lock().unwrap(), HotkeyServiceStatus::Running),
                            detail: match &*hotkey_status.lock().unwrap() {
                                HotkeyServiceStatus::Running => "Windows global hotkey listener registered; physical key proof requires a machine test".into(),
                                HotkeyServiceStatus::RunningWithFallback => "legacy fallback state; choose another configurable hotkey".into(),
                                HotkeyServiceStatus::Unsupported => "unsupported: native global hotkey adapter requires Windows".into(),
                                HotkeyServiceStatus::Unavailable(detail) => format!("unavailable: {detail}"),
                            },
                        },
                        DoctorCheck {
                            name: "audio".into(),
                            ok: slot.is_some() && audio_error.is_none(),
                            detail: match audio_error {
                                None if slot.is_some() => "CPAL input device discovered and native input configuration is available; stream start remains a separate session check".into(),
                                None => "unavailable while a dictation operation is cleaning up".into(),
                                Some(error) => format!("unavailable: {error}"),
                            },
                        },
                        DoctorCheck {
                            name: "whisper".into(),
                            ok: whisper_ready,
                            detail: if slot.is_some() { whisper_detail.clone() } else { "unavailable while a dictation operation is cleaning up".into() },
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
                privacy,
                history_enabled,
                history_retention_limit: handler_store
                    .setting("history.retention_limit")
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                    .and_then(|v| v.as_u64())
                    .unwrap_or(20) as u32,
                hotkey: config_snapshot.hotkey.binding.clone(),
                route: route_summary(&config_snapshot),
                })
            }
            Request::RecentHistory { limit } => Response::RecentHistory(RecentHistoryResponse {
                entries: handler_store.try_recent_history(usize::from(limit)).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?,
            }),
            Request::ResourceGet { resource } => {
                validate_resource(&resource).map_err(sori_ipc::IpcError::Transport)?;
                let legacy = handler_store
                    .setting(&format!("resource.{resource}"))
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                let value = handler_store
                    .resource(&resource)
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                    .or(legacy)
                    .unwrap_or_else(|| default_resource(&resource));
                Response::Resource(sori_ipc::ResourceResponse { resource, value })
            }
            Request::ResourceSet { resource, value } => {
                validate_resource(&resource).map_err(sori_ipc::IpcError::Transport)?;
                if resource == "route" {
                    let provider = handler_model_provider.as_ref().ok_or_else(|| sori_ipc::IpcError::Transport(whisper_detail.clone()))?;
                    validate_route_resource(&value, provider.as_ref()).map_err(|detail| sori_ipc::IpcError::Transport(detail))?;
                }
                handler_store
                    .set_resource(&resource, &value)
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                // Keep the legacy key readable by daemon startup code while all
                // new writes are owned by the user_data resource table.
                handler_store
                    .set_setting(&format!("resource.{resource}"), &value)
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Resource(sori_ipc::ResourceResponse { resource, value })
            }
            Request::ResourceDelete { resource } => {
                validate_resource(&resource).map_err(sori_ipc::IpcError::Transport)?;
                let deleted = handler_store.delete_resource(&resource).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                handler_store.delete_setting(&format!("resource.{resource}")).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                if deleted {
                    Response::Control(ControlResponse { accepted: true, detail: format!("resource {resource} deleted from SQLite") })
                } else {
                    Response::Error(sori_ipc::IpcErrorResponse { code: "not_found".into(), detail: format!("resource {resource} not found") })
                }
            }
            Request::DeleteHistory { id } => {
                let deleted = handler_store
                    .try_delete_history(id)
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                if !deleted {
                    return Err(sori_ipc::IpcError::Transport("history entry not found".into()));
                }
                Response::Control(ControlResponse { accepted: true, detail: "history entry deleted from SQLite".into() })
            }
            Request::PurgeHistory => {
                handler_store.try_purge_history().map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse { accepted: true, detail: "history purged from SQLite".into() })
            }
            Request::SetConfig { key, value } => {
                validate_setting(&key, &value).map_err(sori_ipc::IpcError::Transport)?;
                if key == "hotkey.binding" {
                    let binding = value.as_str().unwrap();
                    let parsed = sorid::parse_hotkey_binding(binding).map_err(sori_ipc::IpcError::Transport)?;
                    let service = handler_hotkey_service.lock().map_err(|_| sori_ipc::IpcError::Transport("hotkey service lock poisoned".into()))?;
                    if let Some(service) = service.as_ref() {
                        service.rebind(parsed).map_err(|error| sori_ipc::IpcError::Transport(format!("cannot register hotkey `{binding}`: {error}; choose another combination")))?;
                    }
                    handler_hotkey_status.lock().map_err(|_| sori_ipc::IpcError::Transport("hotkey status lock poisoned".into()))?.clone_from(&HotkeyServiceStatus::Running);
                }
                handler_store.set_setting(&key, &value).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                if key == "hotkey.binding" {
                    let mut settings = handler_store.resource("settings").map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?.unwrap_or_else(|| serde_json::json!({}));
                    settings["hotkey"] = value.clone();
                    handler_store.set_resource("settings", &settings).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                }
                if key == "hotkey.binding" { handler_config.lock().map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?.hotkey.binding = value.as_str().unwrap().to_owned(); }
                if key == "privacy.mode" { *handler_privacy.lock().map_err(|_| sori_ipc::IpcError::Transport("privacy lock poisoned".into()))? = serde_json::from_value(value.clone()).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?; }
                if key == "route.policy" {
                    let preset: sori_core::RoutePreset = serde_json::from_value(value.clone()).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                    handler_config.lock().map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?.route = preset.policy();
                    let mut route = handler_store.resource("route").map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?.unwrap_or_else(|| default_resource("route"));
                    if let Some(object) = route.as_object_mut() { object.insert("policy".into(), value); }
                    handler_store.set_resource("route", &route).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                    handler_store.set_setting("resource.route", &route).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                }
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
                let mut slot = handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?;
                let runtime = slot.as_mut().ok_or_else(|| sori_ipc::IpcError::Transport("runtime operation in progress".into()))?;
                runtime
                    .pause()
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Control(ControlResponse {
                    accepted: true,
                    detail: "daemon paused".into(),
                })
            }
            Request::Resume => {
                let mut slot = handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?;
                let runtime = slot.as_mut().ok_or_else(|| sori_ipc::IpcError::Transport("runtime operation in progress".into()))?;
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
    // A provider operation may own the runtime slot, so request cancellation
    // first and wait briefly for the handler to return ownership before shutdown.
    if let Ok(active) = dictation_cancellation.lock() {
        if let Some(token) = active.as_ref() {
            token.cancel();
        }
    }
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
    loop {
        if runtime.lock().map(|slot| slot.is_some()).unwrap_or(false)
            || std::time::Instant::now() >= deadline
        {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    let mut runtime_slot = runtime
        .lock()
        .map_err(|_| anyhow::anyhow!("runtime lock poisoned"))?;
    let stopped = if let Some(runtime) = runtime_slot.as_mut() {
        if !matches!(runtime.state(), RuntimeState::ShuttingDown) {
            runtime.shutdown()?;
        }
        matches!(runtime.state(), RuntimeState::ShuttingDown)
    } else {
        info!("sorid stopped with an active operation still unwinding after cancellation deadline");
        false
    };
    loop_result?;
    if stopped {
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

fn busy_status_response(config: &DaemonConfig, privacy: PrivacyMode) -> StatusResponse {
    StatusResponse {
        protocol_version: PROTOCOL_VERSION,
        daemon_version: env!("CARGO_PKG_VERSION").into(),
        running: true,
        activity: RuntimeActivity::Idle,
        paused: false,
        hotkey: config.hotkey.binding.clone(),
        route: route_summary(config),
        profile: ProfileMode::Basic,
        privacy,
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
        "settings" | "preferences" | "vocabulary" | "snippets" | "models" | "benchmarks"
        | "extensions" | "permissions" | "privacy" | "onboarding" | "route" => Ok(()),
        _ => Err(format!("unsupported resource: {resource}")),
    }
}

fn validate_route_resource(
    value: &serde_json::Value,
    provider: &dyn sori_core::ModelProvider,
) -> Result<(), String> {
    let active = value
        .get("activeModelId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "route.activeModelId is required".to_owned())?;
    let (provider_id, model_id) = active
        .split_once('/')
        .unwrap_or((provider.provider_name(), active));
    if provider_id != provider.provider_name() || model_id.trim().is_empty() {
        return Err(format!("unsupported model provider route: {active}"));
    }
    let model = ModelId::from(model_id);
    if !provider.can_transcribe(&model) {
        return Err(format!("model is unavailable: {model_id}"));
    }
    if let Some(fallbacks) = value.get("fallbackModelIds").and_then(|v| v.as_array()) {
        for fallback in fallbacks.iter().filter_map(|v| v.as_str()) {
            let fallback = fallback.strip_prefix("whisper.cpp/").unwrap_or(fallback);
            if !provider.can_transcribe(&ModelId::from(fallback)) {
                return Err(format!("fallback model is unavailable: {fallback}"));
            }
        }
    }
    Ok(())
}

fn validated_benchmark_route(
    requested: &ModelId,
    provider: &dyn sori_core::ModelProvider,
) -> Result<serde_json::Value, String> {
    let requested = requested.0.trim();
    if requested.is_empty() {
        return Err("benchmark recommendation requires a model id".into());
    }
    let model = if let Some((requested_provider, model)) = requested.split_once('/') {
        if requested_provider != provider.provider_name() || model.trim().is_empty() {
            return Err(format!("unsupported benchmark provider/model: {requested}"));
        }
        model.trim()
    } else {
        requested
    };
    let model = ModelId::from(model);
    if !provider.can_transcribe(&model) {
        return Err(format!("benchmark model is unavailable: {}", model.0));
    }
    Ok(
        serde_json::json!({"activeModelId": format!("{}/{}", provider.provider_name(), model.0), "provider": provider.provider_name(), "model": model, "policy": "LocalFirst", "fallbackModelIds": [], "reason": "recommended by persisted benchmark"}),
    )
}

#[cfg(test)]
mod benchmark_recommendation_tests {
    use super::*;
    use sori_core::{AudioChunk, ModelError, ModelManifest, ModelProvider, Transcript};
    struct Provider;
    impl ModelProvider for Provider {
        fn provider_name(&self) -> &'static str {
            "test-provider"
        }
        fn manifests(&self) -> Vec<ModelManifest> {
            Vec::new()
        }
        fn can_transcribe(&self, model: &ModelId) -> bool {
            model.0 == "ready"
        }
        fn transcribe(
            &self,
            _model: &ModelId,
            _audio: &[AudioChunk],
        ) -> Result<Transcript, ModelError> {
            unreachable!()
        }
    }
    #[test]
    fn recommendation_returns_canonical_active_model_route() {
        let route =
            validated_benchmark_route(&ModelId::from("test-provider/ready"), &Provider).unwrap();
        assert_eq!(route["activeModelId"], "test-provider/ready");
        assert_eq!(route["provider"], "test-provider");
    }
    #[test]
    fn recommendation_rejects_unknown_provider_or_model() {
        assert!(validated_benchmark_route(&ModelId::from("other/ready"), &Provider).is_err());
        assert!(validated_benchmark_route(&ModelId::from("missing"), &Provider).is_err());
    }
}

fn default_resource(resource: &str) -> serde_json::Value {
    match resource {
        "vocabulary" | "snippets" | "benchmarks" | "extensions" | "permissions" => {
            serde_json::json!([])
        }
        "settings" => serde_json::json!({}),
        "preferences" => serde_json::json!({}),
        "models" => serde_json::json!([]),
        "privacy" => {
            serde_json::json!({"saveTranscriptHistory": true, "retentionDays": 30, "ephemeralAudio": true, "voiceLock": "unknown", "commandPolicy": "ask-confirmation"})
        }
        "onboarding" => {
            serde_json::json!({"step": "welcome", "completed": false, "microphone": "unknown", "permissions": "unknown", "hotkey": "unknown"})
        }
        "route" => {
            serde_json::json!({"activeModelId": null,"policy":"LocalFirst","fallbackModelIds":[]})
        }
        _ => serde_json::Value::Null,
    }
}
