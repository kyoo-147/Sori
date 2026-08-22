fn validate_owner_override(path: std::path::PathBuf) -> Result<std::path::PathBuf> {
    if !path.is_absolute() || path.file_name().is_none() || (path.exists() && path.is_dir()) {
        anyhow::bail!("SORI_DAEMON_OWNER_PATH must be an absolute file path, not a directory")
    }
    Ok(path)
}

fn daemon_owner_path() -> Result<std::path::PathBuf> {
    if let Some(path) = std::env::var_os("SORI_DAEMON_OWNER_PATH") {
        return validate_owner_override(std::path::PathBuf::from(path));
    }
    if let Some(root) = std::env::var_os("LOCALAPPDATA") {
        return Ok(std::path::PathBuf::from(root)
            .join("Sori")
            .join("daemon-owner.json"));
    }
    Ok(std::path::PathBuf::from("sori-daemon-owner.json"))
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
struct DaemonOwner {
    endpoint: String,
    pid: u32,
    executable: String,
    process_start_time: u64,
    lease_id: String,
}

fn process_start_time() -> Result<u64> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::FILETIME;
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};
        let mut creation = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut exit = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut kernel = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut user = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        if unsafe {
            GetProcessTimes(
                GetCurrentProcess(),
                &mut creation,
                &mut exit,
                &mut kernel,
                &mut user,
            )
        } == 0
        {
            anyhow::bail!("GetProcessTimes failed")
        }
        return Ok((u64::from(creation.dwHighDateTime) << 32) | u64::from(creation.dwLowDateTime));
    }
    #[cfg(not(windows))]
    {
        Ok(0)
    }
}

struct DaemonOwnerLease {
    path: std::path::PathBuf,
    owner: DaemonOwner,
}

impl Drop for DaemonOwnerLease {
    fn drop(&mut self) {
        let Ok(value) = std::fs::read_to_string(&self.path) else {
            return;
        };
        let Ok(current) = serde_json::from_str::<DaemonOwner>(&value) else {
            return;
        };
        if current == self.owner {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

fn can_replace_owner(
    owner: &DaemonOwner,
    endpoint: SocketAddr,
    observed_start: Option<u64>,
) -> bool {
    owner.endpoint == endpoint.to_string()
        || owner.pid == 0
        || observed_start.is_some_and(|start| start != owner.process_start_time)
}

fn replace_owner_file(
    temporary: &std::path::Path,
    path: &std::path::Path,
    endpoint: SocketAddr,
) -> Result<()> {
    let result = (|| {
        if !path.exists() {
            std::fs::rename(temporary, path)?;
            return Ok(());
        }
        let value = std::fs::read_to_string(path).map_err(|error| {
            anyhow::anyhow!("cannot inspect existing daemon owner lease: {error}")
        })?;
        let owner = serde_json::from_str::<DaemonOwner>(&value).map_err(|error| {
            anyhow::anyhow!("refusing to replace ambiguous daemon owner lease: {error}")
        })?;
        let observed_start = if owner.endpoint == endpoint.to_string() || owner.pid == 0 {
            None
        } else {
            process_start_time_for_pid(owner.pid)
        };
        if !can_replace_owner(&owner, endpoint, observed_start) {
            anyhow::bail!(
                "refusing to replace live or ambiguous daemon owner for endpoint {}",
                owner.endpoint
            );
        }
        std::fs::remove_file(path)?;
        std::fs::rename(temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}

fn process_start_time_for_pid(pid: u32) -> Option<u64> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::FILETIME;
        use windows_sys::Win32::System::Threading::{
            GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if process.is_null() {
            return None;
        }
        let mut creation = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut exit = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut kernel = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut user = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let result =
            unsafe { GetProcessTimes(process, &mut creation, &mut exit, &mut kernel, &mut user) };
        unsafe {
            let _ = windows_sys::Win32::Foundation::CloseHandle(process);
        }
        if result == 0 {
            return None;
        }
        Some((u64::from(creation.dwHighDateTime) << 32) | u64::from(creation.dwLowDateTime))
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
        None
    }
}

fn write_daemon_owner(endpoint: SocketAddr) -> Result<DaemonOwnerLease> {
    let path = daemon_owner_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension(format!("json.{}.tmp", std::process::id()));
    let owner = DaemonOwner {
        endpoint: endpoint.to_string(),
        pid: std::process::id(),
        executable: std::env::current_exe()?.to_string_lossy().into_owned(),
        process_start_time: process_start_time()?,
        lease_id: uuid::Uuid::new_v4().to_string(),
    };
    std::fs::write(&temporary, serde_json::to_vec(&owner)?)?;
    replace_owner_file(&temporary, &path, endpoint)?;
    Ok(DaemonOwnerLease { path, owner })
}
use anyhow::Result;
use sori_audio::CpalAudioController;
use sori_core::{
    BenchmarkInput, BenchmarkOptions, CancellationToken, FastIntent, HistoryEntry,
    HistoryRepository, ModelId, ModelProvider, ModelRoute, PrivacyMode, ProfileMode, Vocabulary,
    VocabularyTerm, recommend_benchmark, run_benchmark_with_options,
};
use sori_core::{EventBus, EventKind};
use sori_ipc::{
    ConfigSummaryResponse, ControlResponse, DEFAULT_ENDPOINT, DoctorCheck, DoctorResponse,
    ExtensionManifest, ExtensionRecord, ExtensionsResponse, IpcEvent, LocalIpcServer,
    PROTOCOL_VERSION, RecentEventsResponse, RecentHistoryResponse, Request, Response, RouteSummary,
    RuntimeActivity, StatusResponse, effective_benchmark_timeout,
};
use sori_persistence::SqliteStore;
use sori_provider_whisper::{WhisperCppConfig, WhisperCppProvider};
use sorid::{
    DaemonConfig, DaemonRuntime, DictationCompletionOptions, HotkeyService, HotkeyServiceStatus,
    RuntimeState, SharedEventBus, start_hotkey_service,
};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tracing::info;

struct BenchmarkTimeoutGuard {
    complete: Sender<()>,
    timer: Option<JoinHandle<()>>,
}

impl Drop for BenchmarkTimeoutGuard {
    fn drop(&mut self) {
        let _ = self.complete.send(());
        if let Some(timer) = self.timer.take() {
            let _ = timer.join();
        }
    }
}

fn benchmark_timeout_guard(
    cancellation: CancellationToken,
    timeout_triggered: Arc<AtomicBool>,
    timeout: std::time::Duration,
) -> BenchmarkTimeoutGuard {
    let (complete, done) = mpsc::channel();
    let timer = std::thread::spawn(move || {
        if matches!(
            done.recv_timeout(timeout),
            Err(mpsc::RecvTimeoutError::Timeout)
        ) {
            timeout_triggered.store(true, Ordering::Release);
            cancellation.cancel();
        }
    });
    BenchmarkTimeoutGuard {
        complete,
        timer: Some(timer),
    }
}

#[cfg(test)]
mod benchmark_timeout_tests {
    use super::*;

    #[test]
    fn completed_benchmark_timer_exits_promptly() {
        let cancellation = CancellationToken::new();
        let timed_out = Arc::new(AtomicBool::new(false));
        let started = std::time::Instant::now();
        {
            let _guard = benchmark_timeout_guard(
                cancellation.clone(),
                Arc::clone(&timed_out),
                std::time::Duration::from_secs(1),
            );
        }
        assert!(started.elapsed() < std::time::Duration::from_millis(250));
        assert!(!timed_out.load(Ordering::Acquire));
        assert!(!cancellation.is_cancelled());
    }

    #[test]
    fn benchmark_timer_cancels_when_deadline_expires() {
        let cancellation = CancellationToken::new();
        let timed_out = Arc::new(AtomicBool::new(false));
        let guard = benchmark_timeout_guard(
            cancellation.clone(),
            Arc::clone(&timed_out),
            std::time::Duration::from_millis(20),
        );
        std::thread::sleep(std::time::Duration::from_millis(80));
        assert!(timed_out.load(Ordering::Acquire));
        assert!(cancellation.is_cancelled());
        drop(guard);
    }
}

/// Explicitly opt-in provider for installed vertical validation when whisper.cpp
/// and a model are absent. This is test wiring evidence, never ASR evidence.
struct DeterministicSapiProvider {
    text: String,
    model: ModelId,
}
impl ModelProvider for DeterministicSapiProvider {
    fn provider_name(&self) -> &'static str {
        "deterministic-test"
    }
    fn manifests(&self) -> Vec<sori_core::ModelManifest> {
        vec![sori_core::ModelManifest {
            id: self.model.clone(),
            display_name: "SAPI WAV wiring provider (test only)".into(),
            language: "en".into(),
            backend: self.provider_name().into(),
            quantization: None,
            disk_size_bytes: None,
            ram_bytes: None,
            license: sori_core::ModelLicense {
                name: "test-only; no model".into(),
                url: None,
                attribution: None,
            },
            source: Some("installed synthetic provider; no download".into()),
            sha256: None,
        }]
    }
    fn can_transcribe(&self, model: &ModelId) -> bool {
        model == &self.model
    }
    fn runtime_status(&self, model: &ModelId) -> sori_core::RuntimeStatus {
        sori_core::RuntimeStatus {
            model: model.clone(),
            installed: self.can_transcribe(model),
            loaded: self.can_transcribe(model),
            warm: self.can_transcribe(model),
            memory_bytes: None,
            backend: Some(self.provider_name().into()),
            phase: Some("TestOnlyDeterministic".into()),
            progress_percent: None,
            error: None,
        }
    }
    fn transcribe(
        &self,
        model: &ModelId,
        audio: &[sori_core::AudioChunk],
    ) -> Result<sori_core::Transcript, sori_core::ModelError> {
        if !self.can_transcribe(model) {
            return Err(sori_core::ModelError::Inference(format!(
                "unknown deterministic test model: {}",
                model.0
            )));
        }
        if audio.is_empty() || audio.iter().all(|chunk| chunk.samples.is_empty()) {
            return Err(sori_core::ModelError::Inference(
                "deterministic provider requires decoded WAV audio".into(),
            ));
        }
        Ok(sori_core::Transcript::plain(&self.text))
    }
}
/// `activeModelId` is provider-qualified at the IPC boundary, while provider
/// APIs receive the model filename only. Keep this conversion in one place so
/// hotkey, dictation, lifecycle, and removal cannot disagree about the route.
fn provider_model_id(provider: &str, model: &str) -> ModelId {
    ModelId::from(model.strip_prefix(&format!("{provider}/")).unwrap_or(model))
}

#[derive(Clone, PartialEq, Eq)]
struct RuntimeTarget {
    identity: Option<String>,
    #[cfg(windows)]
    hwnd: usize,
    #[cfg(windows)]
    pid: u32,
}
struct DictationSession {
    id: uuid::Uuid,
    cancellation: CancellationToken,
    target: Option<RuntimeTarget>,
}

type DictationSessionState = Arc<Mutex<Option<DictationSession>>>;

fn clear_dictation_session_if(state: &DictationSessionState, id: uuid::Uuid) {
    if let Ok(mut active) = state.lock() {
        if active.as_ref().is_some_and(|session| session.id == id) {
            *active = None;
        }
    }
}

fn clear_dictation_target_if(state: &DictationSessionState, id: uuid::Uuid) {
    if let Ok(mut active) = state.lock() {
        if let Some(session) = active.as_mut().filter(|session| session.id == id) {
            session.target = None;
        }
    }
}

fn set_dictation_target_if(
    state: &DictationSessionState,
    id: uuid::Uuid,
    target: RuntimeTarget,
) -> bool {
    state
        .lock()
        .ok()
        .and_then(|mut active| {
            active
                .as_mut()
                .filter(|session| session.id == id)
                .map(|session| {
                    session.target = Some(target);
                    true
                })
        })
        .unwrap_or(false)
}

fn active_dictation_token(
    state: &DictationSessionState,
) -> Result<(uuid::Uuid, CancellationToken), &'static str> {
    let active = state
        .lock()
        .map_err(|_| "dictation session lock poisoned")?;
    let session = active.as_ref().ok_or("no dictation session is active")?;
    Ok((session.id, session.cancellation.clone()))
}

#[cfg_attr(not(test), allow(dead_code))]
fn dictation_session_matches(
    state: &DictationSessionState,
    id: uuid::Uuid,
    target: &RuntimeTarget,
) -> bool {
    state
        .lock()
        .ok()
        .and_then(|active| {
            active
                .as_ref()
                .map(|session| session.id == id && session.target.as_ref() == Some(target))
        })
        .unwrap_or(false)
}

fn active_dictation_session(
    state: &DictationSessionState,
) -> Result<(uuid::Uuid, CancellationToken, RuntimeTarget), &'static str> {
    let active = state
        .lock()
        .map_err(|_| "dictation session lock poisoned")?;
    let session = active.as_ref().ok_or("no dictation session is active")?;
    let target = session
        .target
        .clone()
        .ok_or("dictation target is not ready")?;
    Ok((session.id, session.cancellation.clone(), target))
}

impl RuntimeTarget {
    #[allow(clippy::needless_return)]
    fn capture() -> Result<Self, String> {
        #[cfg(windows)]
        {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                GetForegroundWindow, GetWindowThreadProcessId, IsWindow,
            };
            let hwnd = unsafe { GetForegroundWindow() };
            if hwnd.is_null() || unsafe { IsWindow(hwnd) } == 0 {
                return Err("no usable foreground window is available for text insertion".into());
            }
            let mut pid = 0;
            unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
            if pid == 0 {
                return Err("foreground window has no owning process".into());
            }
            Ok(Self {
                identity: Some(format!("pid:{pid};hwnd:{:x}", hwnd as usize)),
                hwnd: hwnd as usize,
                pid,
            })
        }
        #[cfg(not(windows))]
        {
            Ok(Self { identity: None })
        }
    }

    /// Revalidate the held target before provider work or input. HWND values
    /// can become stale, and Windows may reuse a handle for another process.
    #[cfg(windows)]
    fn validate_alive(&self) -> Result<(), String> {
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowThreadProcessId, IsWindow};
        if unsafe { IsWindow(self.hwnd as _) } == 0 {
            return Err(format!(
                "held target HWND 0x{:x} no longer exists",
                self.hwnd
            ));
        }
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(self.hwnd as _, &mut pid) };
        if pid == 0 || pid != self.pid {
            return Err(format!(
                "held target ownership changed (hwnd=0x{:x} expected_pid={} actual_pid={})",
                self.hwnd, self.pid, pid
            ));
        }
        Ok(())
    }

    #[cfg(not(windows))]
    fn validate_alive(&self) -> Result<(), String> {
        Ok(())
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
    strategy: Option<sori_core::InjectionStrategy>,
    test_only_no_os_injection: bool,
}
impl RuntimeInjector {
    fn new() -> Self {
        Self::with_strategy(None)
    }
    fn with_strategy(strategy: Option<sori_core::InjectionStrategy>) -> Self {
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
            strategy,
            test_only_no_os_injection: std::env::var("SORI_TEST_NO_OS_INJECTION").as_deref()
                == Ok("1"),
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
        if self.test_only_no_os_injection {
            return Ok(sori_core::TextInjectionResult {
                plan: self.inner.plan(target),
                dry_run_output: Some("TEST-ONLY no OS injection performed".into()),
                outcome: sori_core::InjectionOutcome::Inserted,
                diagnostics: vec!["TEST-ONLY no-OS-injection seam".into()],
            });
        }
        if self.strategy == Some(sori_core::InjectionStrategy::ClipboardPaste) {
            #[cfg(windows)]
            {
                self.inner.inject_clipboard(target, request)
            }
            #[cfg(not(windows))]
            {
                self.inner.inject(target, request)
            }
        } else {
            self.inner.inject(target, request)
        }
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

fn reserve_dictation_session(
    state: &DictationSessionState,
) -> Result<(uuid::Uuid, CancellationToken), &'static str> {
    let id = uuid::Uuid::new_v4();
    let cancellation = CancellationToken::new();
    let mut active = state
        .lock()
        .map_err(|_| "dictation session lock poisoned")?;
    if active.is_some() {
        return Err("dictation session is already active; cancel or stop it before starting again");
    }
    *active = Some(DictationSession {
        id,
        cancellation: cancellation.clone(),
        target: None,
    });
    Ok((id, cancellation))
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
    let test_provider_mode = std::env::var("SORI_TEST_PROVIDER").ok();
    let test_provider_text = std::env::var("SORI_TEST_PROVIDER_TEXT").ok();
    if test_provider_mode.is_some() != test_provider_text.is_some() {
        return Err(anyhow::anyhow!(
            "SORI_TEST_PROVIDER and SORI_TEST_PROVIDER_TEXT must be provided together"
        ));
    }
    if let Some(text) = test_provider_text.as_deref() {
        if text.trim().is_empty() {
            return Err(anyhow::anyhow!(
                "SORI_TEST_PROVIDER_TEXT must contain non-whitespace text"
            ));
        }
    }
    let no_os_injection = std::env::var("SORI_TEST_NO_OS_INJECTION").as_deref() == Ok("1");
    if no_os_injection && test_provider_mode.as_deref() != Some("deterministic-sapi") {
        return Err(anyhow::anyhow!(
            "SORI_TEST_NO_OS_INJECTION requires SORI_TEST_PROVIDER=deterministic-sapi"
        ));
    }
    let (whisper_provider, whisper_detail): (Option<Arc<dyn sori_core::ModelProvider>>, String) =
        if let (Ok(mode), Ok(text)) = (
            std::env::var("SORI_TEST_PROVIDER"),
            std::env::var("SORI_TEST_PROVIDER_TEXT"),
        ) {
            if mode != "deterministic-sapi" {
                return Err(anyhow::anyhow!("unsupported SORI_TEST_PROVIDER `{mode}`"));
            }
            let model = ModelId::from("sapi-wav-test");
            (
                Some(Arc::new(DeterministicSapiProvider { text, model })
                    as Arc<dyn sori_core::ModelProvider>),
                "TEST-ONLY deterministic SAPI WAV provider; no Whisper inference".into(),
            )
        } else {
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
                            let manifest_detail = provider
                                .manifests()
                                .iter()
                                .map(|manifest| {
                                    format!(
                                        "{} sha256={} license={} source={}",
                                        manifest.id.0,
                                        manifest.sha256.as_deref().unwrap_or("unavailable"),
                                        manifest.license.name,
                                        manifest.source.as_deref().unwrap_or("unavailable")
                                    )
                                })
                                .collect::<Vec<_>>()
                                .join("; ");
                            let detail = format!(
                                "whisper.cpp executable={} model_dir={} discovered {count} model(s): {manifest_detail}",
                                provider.executable().display(),
                                provider
                                    .model_dir()
                                    .map_or("<none>".to_owned(), |path| path.display().to_string())
                            );
                            (Some(Arc::new(provider)), detail)
                        }
                        Err(error) => (None, format!("unavailable: {error}")),
                    }
                }
                Err(error) => (None, format!("unavailable: {error}")),
            }
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
    if let Some(value) = store.setting("audio.device_id")? {
        config.audio.device_id = value.as_str().map(str::to_owned);
    }
    if let Some(binding) = std::env::var_os("SORI_HOTKEY_OVERRIDE") {
        config.hotkey.binding = binding.to_string_lossy().into_owned();
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
                .map(|id| provider_model_id("whisper.cpp", id))
        })
        .unwrap_or_else(|| ModelId::from(whisper_model.as_str()));
    // Claim the loopback endpoint before initializing optional global input
    // integrations. A second daemon must fail closed immediately instead of
    // waiting on hotkey registration while the endpoint is already owned.
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

    let hotkey = sorid::parse_hotkey_binding(&config.hotkey.binding).map_err(|error| {
        anyhow::anyhow!(
            "invalid configured hotkey `{}`: {error}",
            config.hotkey.binding
        )
    })?;
    let hotkey_history = Arc::clone(&store);
    // Bind the focused target at physical key-down; release must not retarget.
    let hotkey_target_state = Arc::new(Mutex::new(None::<RuntimeTarget>));
    let hotkey_target_for_callback = Arc::clone(&hotkey_target_state);
    let hotkey_result: Result<(HotkeyService, HotkeyServiceStatus), _> = start_hotkey_service(
        Arc::new(events.clone()),
        hotkey,
        Arc::new(move |event| {
            if let Ok(mut slot) = hotkey_runtime.lock() {
                if let Some(mut runtime) = slot.take() {
                    drop(slot);
                    match event {
                        sori_core::HotkeyEvent::Pressed => match RuntimeTarget::capture() {
                            Ok(target) => {
                                let target_for_pipeline = RuntimeTarget {
                                    identity: target.identity.clone(),
                                    #[cfg(windows)]
                                    hwnd: target.hwnd,
                                    #[cfg(windows)]
                                    pid: target.pid,
                                };
                                if let Ok(mut held) = hotkey_target_for_callback.lock() {
                                    *held = Some(target);
                                }
                                let mut injector = RuntimeInjector::new();
                                runtime.handle_hotkey_with_pipeline(
                                    event,
                                    &hotkey_model,
                                    &mut injector,
                                    &target_for_pipeline,
                                    hotkey_history.as_ref(),
                                    &Vocabulary::default(),
                                );
                            }
                            Err(error) => {
                                tracing::warn!(detail = %error, "hotkey target capture unavailable; refusing to start capture");
                                let _ = runtime.stop_audio(true);
                            }
                        },
                        sori_core::HotkeyEvent::Released => {
                            let target = hotkey_target_for_callback
                                .lock()
                                .ok()
                                .and_then(|mut held| held.take());
                            if let Some(target) = target {
                                if let Err(error) = target.validate_alive() {
                                    tracing::warn!(detail = %error, "held hotkey target is stale; refusing insertion");
                                    let _ = runtime.stop_audio(true);
                                    if let Ok(mut slot) = hotkey_target_for_callback.lock() {
                                        slot.take();
                                    }
                                    if let Ok(mut slot) = hotkey_runtime.lock() {
                                        *slot = Some(runtime);
                                    }
                                    return;
                                }
                                let mut injector = RuntimeInjector::new();
                                runtime.handle_hotkey_with_pipeline(
                                    event,
                                    &hotkey_model,
                                    &mut injector,
                                    &target,
                                    hotkey_history.as_ref(),
                                    &Vocabulary::default(),
                                );
                            } else {
                                tracing::warn!(
                                    "hotkey release had no captured foreground target; cancelling capture"
                                );
                                let _ = runtime.stop_audio(true);
                            }
                        }
                        sori_core::HotkeyEvent::Cancelled => {
                            let _ = hotkey_target_for_callback
                                .lock()
                                .map(|mut held| held.take());
                            let target = RuntimeTarget {
                                identity: None,
                                #[cfg(windows)]
                                hwnd: 0,
                                #[cfg(windows)]
                                pid: 0,
                            };
                            runtime.handle_hotkey_with_pipeline(
                                event,
                                &hotkey_model,
                                &mut RuntimeInjector::new(),
                                &target,
                                hotkey_history.as_ref(),
                                &Vocabulary::default(),
                            );
                        }
                    }
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
    // Bind first to win launch races, but publish ownership only after startup
    // validation and optional hotkey initialization have completed.
    let _owner_lease = write_daemon_owner(endpoint)?;
    let hotkey_service = Arc::new(Mutex::new(hotkey_service));
    let hotkey_status = Arc::new(Mutex::new(hotkey_status));
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
    let dictation_session: DictationSessionState = Arc::new(Mutex::new(None));
    let handler_dictation_session = Arc::clone(&dictation_session);
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
                    // A configured provider with zero installed artifacts is
                    // operationally available: the UI must show an empty
                    // registry and offer import/configuration, not report a
                    // false provider outage.
                    let available = true;
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
                let status = provider.runtime_status(&model);
                let operation_visible = matches!(status.phase.as_deref(), Some("Downloading") | Some("Failed"));
                if !provider.can_transcribe(&model) && !operation_visible {
                    Response::Error(sori_ipc::IpcErrorResponse { code: "model_unavailable".into(), detail: format!("model is not discovered and ready: {}", model.0) })
                } else {
                    Response::ModelStatus(sori_ipc::ModelStatusResponse { provider: provider.provider_name().into(), status })
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
                let mut manifest = provider.manifests().into_iter().find(|manifest| manifest.id == model)
                    .ok_or_else(|| sori_ipc::IpcError::Transport("model install succeeded but registry did not expose the model".into()))?;
                manifest.source = Some(source.clone());
                handler_store.save_model_manifest(&model.0, &serde_json::to_value(&manifest).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?)
                    .map_err(|e| sori_ipc::IpcError::Transport(format!("model manifest persistence failed: {e}")))?;
                publish_persisted_event(&handler_store, EventKind::ModelChanged, format!("installed:{}", model.0));
                Response::ModelStatus(sori_ipc::ModelStatusResponse { provider: provider.provider_name().into(), status: provider.runtime_status(&model) })
            }
            Request::ModelRemove { model } => {
                let Some(provider) = handler_model_provider.as_ref() else {
                    return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "model_provider_unavailable".into(), detail: whisper_detail.clone() }));
                };
                // Commit the safe route transition before deleting the asset. A
                // persistence error therefore aborts removal instead of leaving
                // SQLite pointing at a file that no longer exists.
                if let Some(route) = handler_store
                    .resource("route")
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                    .or(handler_store.setting("resource.route").map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?)
                {
                    let (safe_route, changed) = invalidate_route_for_model(&route, provider.provider_name(), &model);
                    if changed {
                        handler_store.set_resource("route", &safe_route).map_err(|e| sori_ipc::IpcError::Transport(format!("route invalidation failed: {e}")))?;
                        handler_store.set_setting("resource.route", &safe_route).map_err(|e| sori_ipc::IpcError::Transport(format!("route invalidation failed: {e}")))?;
                        handler_store.save_model_route("active", &safe_route).map_err(|e| sori_ipc::IpcError::Transport(format!("route invalidation failed: {e}")))?;
                        publish_persisted_event(&handler_store, EventKind::ResourceChanged, format!("invalidated:route:{}", model.0));
                    }
                }
                provider.remove_model(&model).map_err(|error| sori_ipc::IpcError::Transport(format!("model removal failed: {error}")))?;
                handler_store.delete_model_manifest(&model.0).map_err(|error| sori_ipc::IpcError::Transport(format!("model manifest removal failed: {error}")))?;
                publish_persisted_event(&handler_store, EventKind::ModelChanged, format!("removed:{}", model.0));
                Response::ModelStatus(sori_ipc::ModelStatusResponse { provider: provider.provider_name().into(), status: provider.runtime_status(&model) })
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
                // Do not wait behind native adapter work; while an operation owns
                // the slot, the stable response is the busy status view.
                let slot = match handler_runtime.try_lock() {
                    Ok(slot) => slot,
                    Err(std::sync::TryLockError::WouldBlock) => {
                        return Ok(Response::Status(busy_status_response(&config_snapshot, privacy)));
                    }
                    Err(std::sync::TryLockError::Poisoned(_)) => {
                        return Err(sori_ipc::IpcError::Transport("runtime lock poisoned".into()));
                    }
                };
                Response::Status(slot.as_ref().map(|runtime| status_response(runtime, &config_snapshot, privacy)).unwrap_or_else(|| busy_status_response(&config_snapshot, privacy)))
            }

            Request::DictationStart => {
                let (session_id, cancellation) = reserve_dictation_session(&handler_dictation_session)
                    .map_err(|detail| sori_ipc::IpcError::Transport(detail.into()))?;
                let target = match RuntimeTarget::capture() {
                    Ok(target) => target,
                    Err(error) => {
                        clear_dictation_session_if(&handler_dictation_session, session_id);
                        return Err(sori_ipc::IpcError::Transport(format!("focused target unavailable: {error}")));
                    }
                };
                if !set_dictation_target_if(&handler_dictation_session, session_id, target) {
                    clear_dictation_session_if(&handler_dictation_session, session_id);
                    return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "dictation_cancelled".into(), detail: "dictation was cancelled while the focused target was captured".into() }));
                }
                let mut runtime = match handler_runtime.try_lock() {
                    Ok(mut slot) => match slot.take() {
                        Some(runtime) => runtime,
                        None => {
                            clear_dictation_session_if(&handler_dictation_session, session_id);
                            return Err(sori_ipc::IpcError::Transport("runtime operation in progress".into()));
                        }
                    },
                    Err(_) => {
                        clear_dictation_session_if(&handler_dictation_session, session_id);
                        return Err(sori_ipc::IpcError::Transport("runtime operation is busy; retry shortly".into()));
                    }
                };
                if let Err(error) = runtime.start_audio() {
                    handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?.replace(runtime);
                    clear_dictation_session_if(&handler_dictation_session, session_id);
                    return Err(sori_ipc::IpcError::Transport(error.to_string()));
                }
                if cancellation.is_cancelled() {
                    let _ = runtime.stop_audio(true);
                    handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?.replace(runtime);
                    clear_dictation_session_if(&handler_dictation_session, session_id);
                    return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "dictation_cancelled".into(), detail: "dictation was cancelled while microphone capture was starting".into() }));
                }
                handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?.replace(runtime);
                Response::Control(ControlResponse { accepted: true, detail: "microphone capture started".into() })
            }
            Request::DictationStop => {
                let (session_id, _, target) = active_dictation_session(&handler_dictation_session)
                    .map_err(|detail| sori_ipc::IpcError::Transport(detail.into()))?;
                target.validate_alive().map_err(|error| sori_ipc::IpcError::Transport(format!("focused target unavailable: {error}")))?;
                let mut runtime = match handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?.take() {
                    Some(runtime) => runtime,
                    None => return Err(sori_ipc::IpcError::Transport("runtime operation in progress".into())),
                };
                let (current_id, cancellation, current_target) = match active_dictation_session(&handler_dictation_session) {
                    Ok(session) => session,
                    Err(detail) => {
                        handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?.replace(runtime);
                        return Err(sori_ipc::IpcError::Transport(detail.into()));
                    }
                };
                if current_id != session_id || current_target != target {
                    handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?.replace(runtime);
                    return Err(sori_ipc::IpcError::Transport("dictation session changed while stopping; retry the active session".into()));
                }
                let target = current_target;
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
                let timeout_token = cancellation.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(30));
                    timeout_token.cancel();
                });
                let result = match runtime.complete_captured_dictation_with_options(DictationCompletionOptions {
                    route: &route,
                    injector: &mut injector,
                    target: &target,
                    history,
                    vocabulary: &vocabulary,
                    cancellation: &cancellation,
                    timeout: Some(std::time::Duration::from_secs(30)),
                }) {
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
                clear_dictation_session_if(&handler_dictation_session, session_id);
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
                let (session_id, cancellation) = active_dictation_token(&handler_dictation_session)
                    .map_err(|detail| sori_ipc::IpcError::Transport(detail.into()))?;
                cancellation.cancel();
                // Never hold the runtime lock while touching session state.
                // Provider work may own the runtime slot, so cancellation is
                // acknowledged even when the audio stop must be retried by it.
                let cancelled_chunks = match handler_runtime.try_lock() {
                    Ok(mut slot) => slot.as_mut().and_then(|runtime| {
                        runtime.stop_audio(true).ok().map(|chunks| {
                            let _ = runtime.take_captured_audio();
                            chunks
                        })
                    }),
                    Err(_) => None,
                };
                if let Some(chunks) = cancelled_chunks {
                    clear_dictation_session_if(&handler_dictation_session, session_id);
                    return Ok(Response::Control(ControlResponse { accepted: true, detail: format!("dictation cancelled after {chunks} chunks") }));
                }
                clear_dictation_target_if(&handler_dictation_session, session_id);
                Response::Control(ControlResponse { accepted: true, detail: "dictation cancellation requested; active provider work will be discarded".into() })
            }
            Request::DictationAudio { model, audio, injection_strategy } => {
                let provider = handler_model_provider.as_ref().ok_or_else(|| sori_ipc::IpcError::Transport("dictation audio unavailable: Whisper provider is not ready".into()))?;
                if !provider.can_transcribe(&model) {
                    return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "model_unavailable".into(), detail: format!("dictation audio model is not discovered and ready: {}", model.0) }));
                }
                let target = RuntimeTarget::capture().map_err(|error| sori_ipc::IpcError::Transport(format!("focused target unavailable: {error}")))?;
                let mut injector = RuntimeInjector::with_strategy(injection_strategy);
                let reason = if no_os_injection {
                    "TEST-ONLY no-OS-injection seam".to_owned()
                } else {
                    format!("canonical audio acceptance; target={}", target.identity.as_deref().unwrap_or("unknown"))
                };
                let route = ModelRoute { provider: provider.provider_name().into(), model: model.clone(), reason, fallback: Vec::new() };
                // Fixture/decoded audio uses the daemon-owned durable event journal too.
                let history_enabled = handler_store
                    .setting("history.enabled")
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                    .and_then(|value| value.as_bool())
                    .unwrap_or(true);
                let no_history = NoopHistory;
                let history: &dyn HistoryRepository = if history_enabled { handler_store.as_ref() } else { &no_history };
                let vocabulary = persisted_vocabulary(&handler_store)
                    .map_err(sori_ipc::IpcError::Transport)?;
                let result = sori_core::complete_dictation_with_vocabulary_options(
                    audio,
                    provider.as_ref(),
                    &mut injector,
                    &target,
                    &route,
                    history,
                    handler_store.as_ref(),
                    &vocabulary,
                    &CancellationToken::new(),
                    Some(std::time::Duration::from_secs(120)),
                ).map_err(|error| sori_ipc::IpcError::Transport(format!("canonical audio dictation failed: {error}")))?;
                if result.inserted_text.is_none() {
                    let detail = result.injection_error.unwrap_or_else(|| "focused target did not confirm text insertion".into());
                    let code = if detail.starts_with("input_blocked:") { "input_blocked" } else { "injection_failed" };
                    return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: code.into(), detail }));
                }
                if history_enabled {
                    let retention = handler_store.setting("history.retention_limit").map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?.and_then(|value| value.as_u64()).unwrap_or(20) as usize;
                    handler_store.try_retain_history(retention).map_err(|e| sori_ipc::IpcError::Transport(format!("history retention failed: {e}")))?;
                }
                Response::Transcript(result.transcript)
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
                if !provider.can_transcribe(&model) {
                    return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "model_unavailable".into(), detail: format!("benchmark model is not discovered and ready: {}", model.0) }));
                }
                let session_id = session_id.unwrap_or_else(uuid::Uuid::new_v4);
                let cancellation = CancellationToken::new();
                handler_benchmark_sessions.lock().map_err(|_| sori_ipc::IpcError::Transport("benchmark session lock poisoned".into()))?.insert(session_id, cancellation.clone());
                let effective_timeout = effective_benchmark_timeout(timeout_ms);
                let timeout_triggered = Arc::new(AtomicBool::new(false));
                let _timeout_guard = benchmark_timeout_guard(
                    cancellation.clone(),
                    Arc::clone(&timeout_triggered),
                    effective_timeout,
                );
                let result = run_benchmark_with_options(provider.as_ref(), &BenchmarkInput { model, audio, reference, iterations: usize::from(iterations) }, &BenchmarkOptions { cancellation: cancellation.clone(), timeout: Some(effective_timeout) });
                handler_benchmark_sessions.lock().map_err(|_| sori_ipc::IpcError::Transport("benchmark session lock poisoned".into()))?.remove(&session_id);
                let result = match result {
                    Ok(result) => result,
                    Err(sori_core::ModelError::Inference(detail)) if timeout_triggered.load(Ordering::Acquire) => return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "benchmark_timed_out".into(), detail: format!("benchmark timed out: {detail}") })),
                    Err(sori_core::ModelError::Inference(detail)) if detail.contains("cancelled") => return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "benchmark_cancelled".into(), detail })),
                    Err(sori_core::ModelError::Inference(detail)) if detail.contains("timed out") => return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "benchmark_timed_out".into(), detail })),
                    Err(error) => return Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "benchmark_failed".into(), detail: error.to_string() })),
                };
                handler_store.save_benchmark(&result).map_err(|e| sori_ipc::IpcError::Transport(format!("benchmark persistence failed: {e}")))?;
                Response::Benchmark(Box::new(result))
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
            Request::AudioReadiness => {
                let slot = match handler_runtime.try_lock() {
                    Ok(slot) => slot,
                    Err(std::sync::TryLockError::WouldBlock) => {
                        return Ok(Response::AudioReadiness(sori_ipc::AudioReadinessResponse {
                            state: sori_ipc::AudioReadinessState::Unavailable,
                            configured: false,
                            detail: "unavailable while another runtime operation is in progress; retry shortly".into(),
                            signal: "UNVERIFIED".into(),
                        }));
                    }
                    Err(std::sync::TryLockError::Poisoned(_)) => {
                        return Err(sori_ipc::IpcError::Transport("runtime lock poisoned".into()));
                    }
                };
                let (state, configured, detail) = match slot.as_ref() {
                    None => (sori_ipc::AudioReadinessState::Unavailable, false, "unavailable while a dictation operation is cleaning up".into()),
                    Some(runtime) if !runtime.audio_available() => (sori_ipc::AudioReadinessState::Unavailable, false, "microphone capture adapter is unavailable; install or enable the native audio backend".into()),
                    Some(runtime) => match runtime.audio_readiness() {
                        Ok(()) => (sori_ipc::AudioReadinessState::Ready, true, "configured input device is discoverable and accepts the configured format; no recording was made".into()),
                        Err(sori_core::AudioError::MissingPermission) => (sori_ipc::AudioReadinessState::PermissionRequired, true, "Windows microphone permission is required; allow Sori in Privacy & security > Microphone, then check again".into()),
                        Err(sori_core::AudioError::DeviceUnavailable(error)) => (sori_ipc::AudioReadinessState::DeviceUnavailable, true, format!("configured input device is unavailable: {error}")),
                        Err(error) => (sori_ipc::AudioReadinessState::Unavailable, true, format!("microphone readiness could not be verified: {error}")),
                    },
                };
                Response::AudioReadiness(sori_ipc::AudioReadinessResponse { state, configured, detail, signal: "UNVERIFIED".into() })
            }
            Request::Doctor => {
                let slot = handler_runtime.lock().map_err(|_| sori_ipc::IpcError::Transport("runtime lock poisoned".into()))?;
                let sqlite_ok = handler_store.migration_status().unwrap_or(false);
                let status = slot.as_ref().map(|runtime| status_response(runtime, &config_snapshot, privacy)).unwrap_or_else(|| busy_status_response(&config_snapshot, privacy));
                let audio_error = slot.as_ref().and_then(|runtime| (!runtime.audio_available()).then_some("microphone capture adapter is unavailable".to_owned()));
                let whisper_ready = slot.as_ref().is_some_and(|runtime| runtime.whisper_available());
                let hotkey_state = hotkey_status.lock().map_err(|_| sori_ipc::IpcError::Transport("hotkey status lock poisoned".into()))?.clone();
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
                            ok: matches!(hotkey_state, HotkeyServiceStatus::Running),
                            detail: match &hotkey_state {
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
                                None if slot.is_some() => "CPAL capture adapter configured; native device readiness remains unverified until a session check".into(),
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
                    .or_else(|| if resource == "route" { handler_store.model_route("active").ok().flatten() } else { None })
                    .or(legacy)
                    .unwrap_or_else(|| default_resource(&resource));
                Response::Resource(sori_ipc::ResourceResponse { resource, value })
            }
            Request::ResourceSet { resource, value } => {
                validate_resource(&resource).map_err(sori_ipc::IpcError::Transport)?;
                if resource == "whisper" {
                    persist_whisper_resource(&value).map_err(sori_ipc::IpcError::Transport)?;
                }
                if resource == "route" {
                    let provider = handler_model_provider.as_ref().ok_or_else(|| sori_ipc::IpcError::Transport(whisper_detail.clone()))?;
                    validate_route_resource(&value, provider.as_ref()).map_err(sori_ipc::IpcError::Transport)?;
                }
                handler_store
                    .set_resource(&resource, &value)
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                if resource == "route" {
                    handler_store.save_model_route("active", &value).map_err(|e| sori_ipc::IpcError::Transport(format!("route persistence failed: {e}")))?;
                }
                publish_persisted_event(&handler_store, EventKind::ResourceChanged, format!("set:{resource}"));
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
                if resource == "route" {
                    handler_store.delete_model_route("active").map_err(|e| sori_ipc::IpcError::Transport(format!("route deletion failed: {e}")))?;
                }
                handler_store.delete_setting(&format!("resource.{resource}")).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                if deleted {
                    publish_persisted_event(&handler_store, EventKind::ResourceChanged, format!("deleted:{resource}"));
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
                publish_persisted_event(&handler_store, EventKind::HistoryChanged, format!("deleted:{id}"));
                Response::Control(ControlResponse { accepted: true, detail: "history entry deleted from SQLite".into() })
            }
            Request::PurgeHistory => {
                handler_store.try_purge_history().map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                publish_persisted_event(&handler_store, EventKind::HistoryChanged, "purged".into());
                Response::Control(ControlResponse { accepted: true, detail: "history purged from SQLite".into() })
            }
            Request::SettingGet { key } => {
                validate_setting_key(&key).map_err(sori_ipc::IpcError::Transport)?;
                let value = handler_store.setting(&key).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Response::Setting(sori_ipc::SettingResponse { key, value })
            }
            Request::SettingDelete { key } => {
                validate_setting_key(&key).map_err(sori_ipc::IpcError::Transport)?;
                // Deleting a setting is a live reset, not just a row delete.
                // The daemon owns the active config and the settings resource
                // is a compatibility mirror, so leaving either stale would
                // make Status disagree with the next restart.
                let exists = handler_store
                    .setting(&key)
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                    .is_some();
                if !exists {
                    Response::Error(sori_ipc::IpcErrorResponse {
                        code: "not_found".into(),
                        detail: format!("setting {key} not found"),
                    })
                } else {
                    match key.as_str() {
                        "hotkey.binding" => {
                            let binding = DaemonConfig::default().hotkey.binding;
                            let parsed = sorid::parse_hotkey_binding(&binding)
                                .map_err(sori_ipc::IpcError::Transport)?;
                            let service = handler_hotkey_service
                                .lock()
                                .map_err(|_| sori_ipc::IpcError::Transport("hotkey service lock poisoned".into()))?;
                            if let Some(service) = service.as_ref() {
                                service.rebind(parsed).map_err(|error| sori_ipc::IpcError::Transport(
                                    format!("cannot restore default hotkey `{binding}`: {error}"),
                                ))?;
                            }
                            handler_config
                                .lock()
                                .map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?
                                .hotkey
                                .binding = binding;
                            let mut settings = handler_store
                                .resource("settings")
                                .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                                .unwrap_or_else(|| serde_json::json!({}));
                            if let Some(object) = settings.as_object_mut() {
                                object.remove("hotkey");
                            }
                            handler_store
                                .set_resource("settings", &settings)
                                .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                        }
                        "audio.device_id" => {
                            handler_config
                                .lock()
                                .map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?
                                .audio
                                .device_id = None;
                        }
                        "privacy.mode" => {
                            *handler_privacy
                                .lock()
                                .map_err(|_| sori_ipc::IpcError::Transport("privacy lock poisoned".into()))? = PrivacyMode::LocalOnly;
                        }
                        "route.policy" => {
                            let policy = sori_core::RoutePreset::LocalFirst.policy();
                            handler_config
                                .lock()
                                .map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?
                                .route = policy;
                            let mut route = handler_store
                                .resource("route")
                                .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?
                                .unwrap_or_else(|| default_resource("route"));
                            if let Some(object) = route.as_object_mut() {
                                object.insert("policy".into(), serde_json::json!("LocalFirst"));
                            }
                            handler_store
                                .set_resource("route", &route)
                                .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                            handler_store
                                .set_setting("resource.route", &route)
                                .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                        }
                        // History settings are read for every operation; their
                        // absence intentionally selects the documented default.
                        "history.enabled" | "history.retention_limit" => {}
                        _ => unreachable!("validated setting key"),
                    }
                    handler_store
                        .delete_setting(&key)
                        .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                    publish_persisted_event(&handler_store, EventKind::SettingChanged, format!("deleted:{key}"));
                    Response::Setting(sori_ipc::SettingResponse { key, value: None })
                }
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
                publish_persisted_event(&handler_store, EventKind::SettingChanged, format!("set:{key}"));
                if key == "hotkey.binding" {
                    let mut settings = handler_store.resource("settings").map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?.unwrap_or_else(|| serde_json::json!({}));
                    settings["hotkey"] = value.clone();
                    handler_store.set_resource("settings", &settings).map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                }
                if key == "hotkey.binding" { handler_config.lock().map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?.hotkey.binding = value.as_str().unwrap().to_owned(); }
                if key == "audio.device_id" { handler_config.lock().map_err(|_| sori_ipc::IpcError::Transport("config lock poisoned".into()))?.audio.device_id = value.as_str().map(str::to_owned); }
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
    if let Ok(active) = dictation_session.lock() {
        if let Some(session) = active.as_ref() {
            session.cancellation.cancel();
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

fn persisted_vocabulary(store: &SqliteStore) -> Result<Vocabulary, String> {
    let value = store
        .resource("vocabulary")
        .map_err(|error| error.to_string())?
        .or_else(|| store.setting("resource.vocabulary").ok().flatten());
    let Some(value) = value else {
        return Ok(Vocabulary::default());
    };
    let items = serde_json::from_value::<Vec<serde_json::Value>>(value)
        .map_err(|error| format!("invalid persisted vocabulary: {error}"))?;
    Ok(Vocabulary {
        terms: items
            .into_iter()
            .filter_map(|item| {
                Some(VocabularyTerm {
                    term: item.get("term")?.as_str()?.to_owned(),
                    pronunciation_hint: item
                        .get("pronunciationHint")
                        .and_then(|value| value.as_str())
                        .map(str::to_owned),
                    correction: item
                        .get("correction")
                        .and_then(|value| value.as_str())
                        .map(str::to_owned),
                })
            })
            .collect(),
    })
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

fn publish_persisted_event(store: &SqliteStore, kind: EventKind, detail: String) {
    store.publish(sori_core::Event {
        id: uuid::Uuid::new_v4(),
        at: time::OffsetDateTime::now_utc(),
        kind,
        payload: sori_core::event::serde_json_like::Value::String(detail),
    });
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

fn validate_setting_key(key: &str) -> Result<(), String> {
    match key {
        "hotkey.binding"
        | "history.enabled"
        | "history.retention_limit"
        | "route.policy"
        | "privacy.mode"
        | "audio.device_id" => Ok(()),
        _ => Err(format!("unsupported setting: {key}")),
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
        "audio.device_id" if value.as_str().is_some_and(|v| !v.trim().is_empty()) => Ok(()),
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
        "audio.device_id" => Err("audio.device_id must be a non-empty string".into()),
        "privacy.mode" => {
            Err("privacy.mode must be Auto, LocalOnly, CloudAllowed, or NeverCloud".into())
        }
        _ => Err(format!("unsupported setting: {key}")),
    }
}

fn persist_whisper_resource(value: &serde_json::Value) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or("whisper runtime configuration must be an object")?;
    let executable = object
        .get("executable")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or("whisper.executable must be a non-empty path")?;
    let model_dir = object
        .get("model_dir")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(std::path::Path::new);
    sori_provider_whisper::WhisperCppConfig::persist_config(
        std::path::Path::new(executable),
        model_dir,
    )
    .map(|_| ())
    .map_err(|error| error.to_string())
}

fn validate_resource(resource: &str) -> Result<(), String> {
    match resource {
        "settings" | "preferences" | "vocabulary" | "snippets" | "models" | "benchmarks"
        | "extensions" | "permissions" | "privacy" | "onboarding" | "route" | "whisper" => Ok(()),
        _ => Err(format!("unsupported resource: {resource}")),
    }
}

fn invalidate_route_for_model(
    route: &serde_json::Value,
    provider: &str,
    model: &ModelId,
) -> (serde_json::Value, bool) {
    let qualified = format!("{provider}/{}", model.0);
    let active = route.get("activeModelId").and_then(|value| value.as_str());
    let active_invalidated = active.is_some_and(|active| active == model.0 || active == qualified);
    let fallback_invalidated = route
        .get("fallbackModelIds")
        .and_then(|value| value.as_array())
        .is_some_and(|fallbacks| {
            fallbacks.iter().any(|value| {
                value
                    .as_str()
                    .is_some_and(|id| id == model.0 || id == qualified)
            })
        });
    if !active_invalidated && !fallback_invalidated {
        return (route.clone(), false);
    }
    let mut next = route.clone();
    if let Some(object) = next.as_object_mut() {
        if active_invalidated {
            object.insert("activeModelId".into(), serde_json::Value::Null);
        }
        if let Some(fallbacks) = object
            .get_mut("fallbackModelIds")
            .and_then(|value| value.as_array_mut())
        {
            fallbacks.retain(|value| {
                value
                    .as_str()
                    .map_or(true, |id| id != model.0 && id != qualified)
            });
        }
    }
    (next, true)
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

fn default_resource(resource: &str) -> serde_json::Value {
    match resource {
        "vocabulary" | "snippets" | "benchmarks" | "extensions" | "permissions" => {
            serde_json::json!([])
        }
        "settings" | "preferences" => serde_json::json!({}),
        "whisper" => serde_json::json!({"executable": null, "model_dir": null}),
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
#[allow(clippy::items_after_test_module)]
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
    #[test]
    fn removing_active_model_clears_route_and_matching_fallbacks() {
        let route = serde_json::json!({
            "activeModelId": "test-provider/ready",
            "policy": "LocalFirst",
            "fallbackModelIds": ["test-provider/ready", "test-provider/other"]
        });
        let (next, invalidated) =
            invalidate_route_for_model(&route, "test-provider", &ModelId::from("ready"));
        assert!(invalidated);
        assert_eq!(next["activeModelId"], serde_json::Value::Null);
        assert_eq!(
            next["fallbackModelIds"],
            serde_json::json!(["test-provider/other"])
        );
        assert_eq!(next["policy"], "LocalFirst");
    }
    #[test]
    fn removing_non_active_model_removes_stale_fallback_but_preserves_active_route() {
        let route = serde_json::json!({
            "activeModelId": "test-provider/ready",
            "fallbackModelIds": ["test-provider/other", "test-provider/ready"]
        });
        let (next, invalidated) =
            invalidate_route_for_model(&route, "test-provider", &ModelId::from("other"));
        assert!(invalidated);
        assert_eq!(next["activeModelId"], "test-provider/ready");
        assert_eq!(
            next["fallbackModelIds"],
            serde_json::json!(["test-provider/ready"])
        );
    }

    #[test]
    fn removing_non_active_model_preserves_route() {
        let route = serde_json::json!({"activeModelId": "test-provider/ready"});
        let (next, invalidated) =
            invalidate_route_for_model(&route, "test-provider", &ModelId::from("other"));
        assert!(!invalidated);
        assert_eq!(next, route);
    }
}

#[cfg(test)]
mod daemon_owner_tests {
    use super::{DaemonOwner, DaemonOwnerLease};
    use std::fs;

    #[test]
    fn lease_drop_does_not_remove_a_newer_generation() {
        let path =
            std::env::temp_dir().join(format!("sori-owner-test-{}.json", uuid::Uuid::new_v4()));
        let first = DaemonOwner {
            endpoint: "127.0.0.1:17373".into(),
            pid: 10,
            executable: "sorid.exe".into(),
            process_start_time: 1,
            lease_id: "first-generation-1234".into(),
        };
        let second = DaemonOwner {
            lease_id: "second-generation-1234".into(),
            ..first.clone()
        };
        fs::write(&path, serde_json::to_vec(&second).unwrap()).unwrap();
        drop(DaemonOwnerLease {
            path: path.clone(),
            owner: first,
        });
        assert!(path.exists());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn stale_owner_file_is_replaced_after_endpoint_claim() {
        let root =
            std::env::temp_dir().join(format!("sori-owner-replace-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("daemon-owner.json");
        let temporary = root.join("daemon-owner.json.tmp");
        let stale = DaemonOwner {
            endpoint: "127.0.0.1:17373".into(),
            pid: 42,
            executable: "sorid.exe".into(),
            process_start_time: 99,
            lease_id: "stale-generation-1234".into(),
        };
        fs::write(&path, serde_json::to_vec(&stale).unwrap()).unwrap();
        fs::write(&temporary, b"current").unwrap();
        super::replace_owner_file(&temporary, &path, "127.0.0.1:17373".parse().unwrap()).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"current");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn different_endpoint_live_or_ambiguous_owner_is_not_replaceable() {
        let owner = DaemonOwner {
            endpoint: "127.0.0.1:17374".into(),
            pid: 7,
            executable: "sorid.exe".into(),
            process_start_time: 99,
            lease_id: "other-generation-1234".into(),
        };
        let endpoint = "127.0.0.1:17373".parse().unwrap();
        assert!(!super::can_replace_owner(&owner, endpoint, Some(99)));
        assert!(!super::can_replace_owner(&owner, endpoint, None));
        assert!(super::can_replace_owner(&owner, endpoint, Some(100)));
    }

    #[test]
    fn ambiguous_different_endpoint_refuses_and_cleans_temp() {
        let root = std::env::temp_dir().join(format!("sori-owner-refuse-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("daemon-owner.json");
        let temporary = root.join("daemon-owner.json.tmp");
        let owner = DaemonOwner {
            endpoint: "127.0.0.1:17374".into(),
            pid: u32::MAX,
            executable: "sorid.exe".into(),
            process_start_time: 99,
            lease_id: "other-generation-1234".into(),
        };
        fs::write(&path, serde_json::to_vec(&owner).unwrap()).unwrap();
        fs::write(&temporary, b"new").unwrap();
        assert!(
            super::replace_owner_file(&temporary, &path, "127.0.0.1:17373".parse().unwrap())
                .is_err()
        );
        assert!(!temporary.exists());
        assert_eq!(
            fs::read(&path).unwrap(),
            serde_json::to_vec(&owner).unwrap()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn startup_failure_guard_removes_its_owner() {
        let path =
            std::env::temp_dir().join(format!("sori-owner-failure-{}.json", uuid::Uuid::new_v4()));
        let owner = DaemonOwner {
            endpoint: "127.0.0.1:17373".into(),
            pid: 42,
            executable: "sorid.exe".into(),
            process_start_time: 99,
            lease_id: "generation-failure-1234".into(),
        };
        fs::write(&path, serde_json::to_vec(&owner).unwrap()).unwrap();
        drop(DaemonOwnerLease {
            path: path.clone(),
            owner,
        });
        assert!(!path.exists());
    }

    #[test]
    fn invalid_relative_owner_override_fails_closed() {
        assert!(super::validate_owner_override("relative-owner.json".into()).is_err());
    }

    #[test]
    fn invalid_directory_owner_override_fails_closed() {
        let directory =
            std::env::temp_dir().join(format!("sori-owner-dir-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        assert!(super::validate_owner_override(directory.clone()).is_err());
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn owner_metadata_requires_unique_generation_identity() {
        let owner = DaemonOwner {
            endpoint: "127.0.0.1:17373".into(),
            pid: 42,
            executable: "sorid.exe".into(),
            process_start_time: 99,
            lease_id: "generation-1234567890".into(),
        };
        let encoded = serde_json::to_value(&owner).unwrap();
        assert!(encoded["process_start_time"].as_u64().is_some());
        assert!(encoded["lease_id"].as_str().unwrap().len() >= 16);
    }
}

#[cfg(test)]
mod dictation_session_tests {
    use super::{
        DictationSessionState, RuntimeTarget, active_dictation_session, clear_dictation_session_if,
        clear_dictation_target_if, reserve_dictation_session, set_dictation_target_if,
    };
    use std::sync::{Arc, Mutex};
    use std::thread;

    fn target(name: &str) -> RuntimeTarget {
        RuntimeTarget {
            identity: Some(name.into()),
            #[cfg(windows)]
            hwnd: 1,
            #[cfg(windows)]
            pid: 1,
        }
    }

    #[test]
    fn duplicate_reservation_is_busy_and_does_not_capture_or_replace_target() {
        let state: DictationSessionState = Arc::new(Mutex::new(None));
        let (id, _) = reserve_dictation_session(&state).unwrap();
        assert!(reserve_dictation_session(&state).is_err());
        assert!(set_dictation_target_if(&state, id, target("owned")));
        let (_, _, held) = active_dictation_session(&state).unwrap();
        assert_eq!(held.identity.as_deref(), Some("owned"));
    }

    #[test]
    fn failed_stop_observation_keeps_target_until_terminal_cleanup() {
        let state: DictationSessionState = Arc::new(Mutex::new(None));
        let (id, _) = reserve_dictation_session(&state).unwrap();
        assert!(set_dictation_target_if(&state, id, target("owned")));
        assert_eq!(
            active_dictation_session(&state)
                .unwrap()
                .2
                .identity
                .as_deref(),
            Some("owned")
        );
        clear_dictation_session_if(&state, id);
        assert!(active_dictation_session(&state).is_err());
    }

    #[test]
    fn cancel_clears_only_its_target_and_stale_terminal_cleanup_cannot_clear_new_session() {
        let state: DictationSessionState = Arc::new(Mutex::new(None));
        let (old_id, _) = reserve_dictation_session(&state).unwrap();
        assert!(set_dictation_target_if(&state, old_id, target("old")));
        clear_dictation_target_if(&state, old_id);
        assert!(active_dictation_session(&state).is_err());
        clear_dictation_session_if(&state, old_id);
        let (new_id, _) = reserve_dictation_session(&state).unwrap();
        assert!(set_dictation_target_if(&state, new_id, target("new")));
        clear_dictation_session_if(&state, old_id);
        assert_eq!(
            active_dictation_session(&state)
                .unwrap()
                .2
                .identity
                .as_deref(),
            Some("new")
        );
    }

    #[test]
    fn concurrent_reservation_has_one_owner() {
        let state: DictationSessionState = Arc::new(Mutex::new(None));
        let results = (0..8)
            .map(|_| {
                let state = Arc::clone(&state);
                thread::spawn(move || reserve_dictation_session(&state).is_ok())
            })
            .collect::<Vec<_>>();
        assert_eq!(
            results
                .into_iter()
                .map(|result| result.join().unwrap())
                .filter(|result| *result)
                .count(),
            1
        );
    }
}

#[cfg(test)]
mod dictation_aba_tests {
    use super::{
        DictationSessionState, RuntimeTarget, active_dictation_token, clear_dictation_session_if,
        dictation_session_matches, reserve_dictation_session, set_dictation_target_if,
    };
    use std::sync::{Arc, Mutex};

    fn target(name: &str) -> RuntimeTarget {
        RuntimeTarget {
            identity: Some(name.into()),
            #[cfg(windows)]
            hwnd: 1,
            #[cfg(windows)]
            pid: 1,
        }
    }

    #[test]
    fn cancel_can_claim_reserved_session_before_target_capture() {
        let state: DictationSessionState = Arc::new(Mutex::new(None));
        let (id, cancellation) = reserve_dictation_session(&state).unwrap();
        let (observed_id, observed_cancel) = active_dictation_token(&state).unwrap();
        assert_eq!(observed_id, id);
        observed_cancel.cancel();
        assert!(cancellation.is_cancelled());
        clear_dictation_session_if(&state, id);
        assert!(active_dictation_token(&state).is_err());
    }
    #[test]
    fn stale_stop_generation_cannot_match_new_session_target() {
        let state: DictationSessionState = Arc::new(Mutex::new(None));
        let (old_id, _) = reserve_dictation_session(&state).unwrap();
        let old_target = target("old");
        assert!(set_dictation_target_if(&state, old_id, old_target.clone()));
        clear_dictation_session_if(&state, old_id);
        let (new_id, _) = reserve_dictation_session(&state).unwrap();
        let new_target = target("new");
        assert!(set_dictation_target_if(&state, new_id, new_target.clone()));
        assert!(!dictation_session_matches(&state, old_id, &old_target));
        assert!(dictation_session_matches(&state, new_id, &new_target));
    }
}
