//! Deterministic backend-only E2E seam.
//!
//! This test speaks the real loopback IPC transport and supplies fakes only at
//! the audio, provider, and injector boundaries. It intentionally does not
//! import the desktop application or the IPC mock transport.

use sori_core::{
    AudioCaptureEngine, AudioChunk, AudioEngine, AudioError, AudioFormat, BenchmarkInput,
    BenchmarkOptions, CancellationToken, EventKind, InjectorCapabilities, ModelError, ModelId,
    ModelProvider, ModelRoute, SampleFormat, TextInjectionError, TextInjectionRequest,
    TextInjectionResult, TextInjector, TextTarget, TextTargetCapabilities, Transcript,
    run_dictation,
};
use sori_ipc::{IpcClient, LocalIpcClient, LocalIpcServer, Request, Response};
use sori_persistence::SqliteStore;
use sorid::{DaemonRuntime, SharedEventBus};
use std::sync::atomic::{AtomicBool, Ordering};
use std::net::TcpListener;
use std::process::{Child, Command};
use std::time::Duration;
use std::sync::{Arc, Mutex};
use time::OffsetDateTime;

const MODEL: &str = "fake-whisper";

struct KillOnDrop(Option<Child>);
impl Drop for KillOnDrop {
    fn drop(&mut self) {
        if let Some(child) = self.0.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[derive(Clone)]
struct FakeProvider {
    calls: Arc<Mutex<Vec<usize>>>,
}
impl ModelProvider for FakeProvider {
    fn provider_name(&self) -> &'static str {
        "deterministic-fake-whisper"
    }
    fn can_transcribe(&self, model: &ModelId) -> bool {
        model.0 == MODEL
    }
    fn transcribe(&self, model: &ModelId, audio: &[AudioChunk]) -> Result<Transcript, ModelError> {
        self.calls.lock().unwrap().push(audio.len());
        if !self.can_transcribe(model) {
            return Err(ModelError::Unsupported(model.clone()));
        }
        Ok(Transcript::plain("deterministic transcript"))
    }
}

struct FakeCapture {
    chunks: Vec<AudioChunk>,
    running: bool,
}
impl AudioEngine for FakeCapture {
    fn input_format(&self) -> AudioFormat {
        AudioFormat {
            sample_rate_hz: 16_000,
            channels: 1,
            sample_format: SampleFormat::F32,
        }
    }
    fn next_chunk(&mut self) -> Result<Option<AudioChunk>, AudioError> {
        Ok(self.chunks.pop())
    }
}
impl AudioCaptureEngine for FakeCapture {
    fn start_capture(&mut self) -> Result<sori_core::AudioDeviceInfo, AudioError> {
        self.running = true;
        Ok(sori_core::AudioDeviceInfo {
            id: "fake-mic".into(),
            name: "fake microphone".into(),
            is_default_input: true,
        })
    }
    fn stop_capture(&mut self) {
        self.running = false;
    }
    fn is_running(&self) -> bool {
        self.running
    }
}

struct FakeTarget;
impl TextTarget for FakeTarget {
    fn name(&self) -> &str {
        "fake-editor"
    }
    fn capabilities(&self) -> TextTargetCapabilities {
        TextTargetCapabilities {
            accepts_text: true,
            supports_direct_input: true,
            supports_clipboard_paste: false,
            supports_undo: false,
            requires_elevation: false,
        }
    }
}

struct FakeInjector {
    fail: bool,
    injected: Arc<Mutex<Vec<String>>>,
}
impl TextInjector for FakeInjector {
    fn capabilities(&self) -> InjectorCapabilities {
        InjectorCapabilities {
            direct_input: true,
            clipboard: false,
            clipboard_restore: false,
            undo: false,
        }
    }
    fn plan(&self, _: &dyn TextTarget) -> sori_core::InjectionPlan {
        sori_core::InjectionPlan {
            target: "fake-editor".into(),
            strategy: sori_core::InjectionStrategy::DirectInput,
            clipboard_policy: sori_core::ClipboardPolicy::NotUsed,
            undo_restore: sori_core::UndoRestoreAttempt {
                status: sori_core::UndoRestoreStatus::NotSupported,
                description: "deterministic test".into(),
            },
        }
    }
    fn inject(
        &mut self,
        target: &dyn TextTarget,
        request: &TextInjectionRequest,
    ) -> Result<TextInjectionResult, TextInjectionError> {
        if self.fail {
            return Err(TextInjectionError::Adapter("fake injector failure".into()));
        }
        self.injected.lock().unwrap().push(request.text.clone());
        Ok(TextInjectionResult {
            plan: self.plan(target),
            dry_run_output: None,
            outcome: sori_core::InjectionOutcome::Inserted,
            diagnostics: Vec::new(),
        })
    }
}

struct ReplayAudio {
    chunks: Vec<AudioChunk>,
}
impl AudioEngine for ReplayAudio {
    fn input_format(&self) -> AudioFormat {
        AudioFormat {
            sample_rate_hz: 16_000,
            channels: 1,
            sample_format: SampleFormat::F32,
        }
    }
    fn next_chunk(&mut self) -> Result<Option<AudioChunk>, AudioError> {
        Ok(self.chunks.pop())
    }
}

fn chunk(value: f32) -> AudioChunk {
    AudioChunk {
        captured_at: OffsetDateTime::UNIX_EPOCH,
        format: AudioFormat {
            sample_rate_hz: 16_000,
            channels: 1,
            sample_format: SampleFormat::F32,
        },
        samples: vec![value; 4],
    }
}
fn route() -> ModelRoute {
    ModelRoute {
        provider: "deterministic-fake-whisper".into(),
        model: ModelId::from(MODEL),
        reason: "e2e".into(),
        fallback: vec![],
    }
}

struct Harness {
    runtime: DaemonRuntime<SharedEventBus<SqliteStore>>,
    store: Arc<SqliteStore>,
    provider: Arc<FakeProvider>,
    injected: Arc<Mutex<Vec<String>>>,
    injector_failure: bool,
    next_capture: Vec<AudioChunk>,
}

#[tokio::test]
async fn canonical_ipc_exercises_success_cancellation_and_injection_fallback() {
    let store = Arc::new(SqliteStore::open_in_memory().unwrap());
    let events = SharedEventBus(Arc::clone(&store));
    let provider = Arc::new(FakeProvider {
        calls: Arc::new(Mutex::new(Vec::new())),
    });
    let mut runtime = DaemonRuntime::new_with_provider(events.clone(), provider.clone());
    runtime.set_audio_engine(Box::new(FakeCapture {
        chunks: vec![],
        running: false,
    }));
    let harness = Arc::new(Mutex::new(Harness {
        runtime,
        store: store.clone(),
        provider: provider.clone(),
        injected: Arc::new(Mutex::new(Vec::new())),
        injector_failure: false,
        next_capture: vec![chunk(0.5), chunk(0.4), chunk(0.0)],
    }));
    let server = LocalIpcServer::bind("127.0.0.1:0".parse().unwrap())
        .await
        .unwrap();
    let endpoint = server.local_addr().unwrap();
    let handler_harness = harness.clone();
    let task = tokio::spawn(server.serve(move |request| {
        let mut h = handler_harness.lock().unwrap();
        match request {
            Request::DictationStart => {
                let chunks = std::mem::take(&mut h.next_capture);
                h.runtime.set_audio_engine(Box::new(FakeCapture {
                    chunks,
                    running: false,
                }));
                h.runtime
                    .start_audio()
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Ok(Response::Control(sori_ipc::ControlResponse {
                    accepted: true,
                    detail: "capture started".into(),
                }))
            }
            Request::DictationCancel => {
                h.runtime
                    .stop_audio(true)
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                h.runtime.take_captured_audio();
                Ok(Response::Control(sori_ipc::ControlResponse {
                    accepted: true,
                    detail: "cancelled".into(),
                }))
            }
            Request::DictationStop => {
                h.runtime
                    .stop_audio(false)
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                let audio = h.runtime.take_captured_audio();
                let mut injector = FakeInjector {
                    fail: h.injector_failure,
                    injected: h.injected.clone(),
                };
                let result = run_dictation(
                    &mut ReplayAudio { chunks: audio },
                    h.provider.as_ref(),
                    &mut injector,
                    &FakeTarget,
                    &route(),
                    h.store.as_ref(),
                    h.runtime.events(),
                )
                .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Ok(Response::Transcript(result.transcript))
            }
            Request::DeleteHistory { id } => {
                let deleted = h
                    .store
                    .try_delete_history(id)
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                if !deleted {
                    return Err(sori_ipc::IpcError::Transport(
                        "history entry not found".into(),
                    ));
                }
                Ok(Response::Control(sori_ipc::ControlResponse {
                    accepted: true,
                    detail: "history entry deleted from SQLite".into(),
                }))
            }
            Request::PurgeHistory => {
                h.store
                    .try_purge_history()
                    .map_err(|e| sori_ipc::IpcError::Transport(e.to_string()))?;
                Ok(Response::Control(sori_ipc::ControlResponse {
                    accepted: true,
                    detail: "history purged from SQLite".into(),
                }))
            }
            Request::RecentEvents { limit } => {
                Ok(Response::RecentEvents(sori_ipc::RecentEventsResponse {
                    events: h
                        .store
                        .try_recent_events_limit(limit as usize)
                        .unwrap()
                        .into_iter()
                        .map(Into::into)
                        .collect(),
                }))
            }
            _ => Err(sori_ipc::IpcError::UnexpectedResponse {
                request: Box::new(request),
            }),
        }
    }));
    let request = |request| {
        tokio::task::spawn_blocking(move || {
            LocalIpcClient::connect_to(endpoint)
                .unwrap()
                .request(request)
        })
    };

    assert!(
        matches!(request(Request::DictationStart).await.unwrap().unwrap(), Response::Control(c) if c.accepted)
    );
    assert!(
        matches!(request(Request::DictationStop).await.unwrap().unwrap(), Response::Transcript(t) if t.text == "deterministic transcript")
    );
    assert_eq!(*provider.calls.lock().unwrap(), vec![3]);
    assert_eq!(
        *harness.lock().unwrap().injected.lock().unwrap(),
        vec!["deterministic transcript"]
    );
    assert_eq!(
        store.try_recent_history(1).unwrap()[0]
            .inserted_text
            .as_deref(),
        Some("deterministic transcript")
    );

    let event_kinds: Vec<_> = store
        .try_recent_events()
        .unwrap()
        .into_iter()
        .map(|e| e.kind)
        .collect();
    let ipc_events = request(Request::RecentEvents { limit: 64 })
        .await
        .unwrap()
        .unwrap();
    let ipc_event_kinds: Vec<_> = match ipc_events {
        Response::RecentEvents(response) => response
            .events
            .into_iter()
            .map(|event| event.kind)
            .collect(),
        other => panic!("unexpected events response: {other:?}"),
    };
    for kind in [
        EventKind::AudioStarted,
        EventKind::AudioChunkCaptured,
        EventKind::AsrSelected,
        EventKind::TranscriptFinal,
        EventKind::ActionAfter,
    ] {
        assert!(event_kinds.contains(&kind), "missing {kind:?}");
        assert!(ipc_event_kinds.contains(&kind), "IPC missing {kind:?}");
    }

    harness.lock().unwrap().next_capture = vec![chunk(0.7)];
    assert!(
        matches!(request(Request::DictationStart).await.unwrap().unwrap(), Response::Control(c) if c.accepted)
    );
    assert!(
        matches!(request(Request::DictationCancel).await.unwrap().unwrap(), Response::Control(c) if c.accepted)
    );
    assert_eq!(store.try_recent_history(10).unwrap().len(), 1);
    assert!(
        store
            .try_recent_events()
            .unwrap()
            .iter()
            .any(|e| e.kind == EventKind::DictationCancelled)
    );

    {
        let mut h = harness.lock().unwrap();
        h.next_capture = vec![chunk(0.8)];
        h.injector_failure = true;
    }
    assert!(
        matches!(request(Request::DictationStart).await.unwrap().unwrap(), Response::Control(c) if c.accepted)
    );
    assert!(
        matches!(request(Request::DictationStop).await.unwrap().unwrap(), Response::Transcript(t) if t.text == "deterministic transcript")
    );
    let history = store.try_recent_history(10).unwrap();
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].inserted_text, None);
    assert!(
        matches!(request(Request::PurgeHistory).await.unwrap().unwrap(), Response::Control(c) if c.accepted)
    );
    assert!(store.try_recent_history(10).unwrap().is_empty());
    assert!(
        store
            .try_recent_events()
            .unwrap()
            .iter()
            .any(|e| e.kind == EventKind::ModelFallback)
    );

    task.abort();
}

struct CancellableBenchmarkProvider {
    started: Arc<AtomicBool>,
    hold: Arc<AtomicBool>,
}

impl ModelProvider for CancellableBenchmarkProvider {
    fn provider_name(&self) -> &'static str {
        "deterministic-benchmark-provider"
    }
    fn can_transcribe(&self, model: &ModelId) -> bool {
        model.0 == MODEL
    }
    fn transcribe(&self, model: &ModelId, _: &[AudioChunk]) -> Result<Transcript, ModelError> {
        if !self.can_transcribe(model) {
            return Err(ModelError::Unsupported(model.clone()));
        }
        Ok(Transcript::plain("deterministic transcript"))
    }
    fn transcribe_with_cancellation(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
        cancellation: &CancellationToken,
    ) -> Result<Transcript, ModelError> {
        self.started.store(true, Ordering::Release);
        while self.hold.load(Ordering::Acquire) {
            if cancellation.is_cancelled() {
                return Err(ModelError::Inference("benchmark cancelled".into()));
            }
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        self.transcribe(model, audio)
    }
}

#[tokio::test]
async fn canonical_ipc_benchmark_cancel_retry_history_reload_and_concurrent_status() {
    let path =
        std::env::temp_dir().join(format!("sori-backend-ipc-{}.sqlite", uuid::Uuid::new_v4()));
    let store = Arc::new(SqliteStore::open(&path).unwrap());
    let provider = Arc::new(CancellableBenchmarkProvider {
        started: Arc::new(AtomicBool::new(false)),
        hold: Arc::new(AtomicBool::new(true)),
    });
    let sessions: Arc<Mutex<std::collections::HashMap<uuid::Uuid, CancellationToken>>> =
        Arc::new(Mutex::new(std::collections::HashMap::new()));
    let server = LocalIpcServer::bind("127.0.0.1:0".parse().unwrap())
        .await
        .unwrap();
    let endpoint = server.local_addr().unwrap();
    let handler_store = Arc::clone(&store);
    let handler_provider = Arc::clone(&provider);
    let handler_sessions = Arc::clone(&sessions);
    let task = tokio::spawn(server.serve(move |request| {
        match request {
            Request::Status => Ok(Response::Status(sori_ipc::StatusResponse {
                protocol_version: sori_ipc::PROTOCOL_VERSION, daemon_version: "e2e".into(), running: true,
                activity: sori_ipc::RuntimeActivity::Idle, paused: false, hotkey: "Alt+Space".into(),
                route: sori_ipc::RouteSummary { prefer_local: true, allow_cloud: false, prefer_warm_runtime: false, optimize_battery: false },
                profile: sori_core::ProfileMode::Basic, privacy: sori_core::PrivacyMode::LocalOnly,
            })),
            Request::RunBenchmark { model, audio, reference, iterations, session_id, timeout_ms } => {
                let session_id = session_id.unwrap_or_else(uuid::Uuid::new_v4);
                let cancellation = CancellationToken::new();
                handler_sessions.lock().unwrap().insert(session_id, cancellation.clone());
                let result = sori_core::run_benchmark_with_options(handler_provider.as_ref(), &BenchmarkInput { model, audio, reference, iterations: usize::from(iterations) }, &BenchmarkOptions { cancellation: cancellation.clone(), timeout: timeout_ms.map(std::time::Duration::from_millis) });
                handler_sessions.lock().unwrap().remove(&session_id);
                let result = result.map_err(|error| sori_ipc::IpcError::Transport(format!("benchmark failed: {error}")))?;
                handler_store.save_benchmark(&result).map_err(|error| sori_ipc::IpcError::Transport(error.to_string()))?;
                Ok(Response::Benchmark(Box::new(result)))
            }
            Request::CancelBenchmark { session_id } => match handler_sessions.lock().unwrap().get(&session_id).cloned() {
                Some(token) => { token.cancel(); Ok(Response::Control(sori_ipc::ControlResponse { accepted: true, detail: "benchmark cancellation requested".into() })) }
                None => Ok(Response::Error(sori_ipc::IpcErrorResponse { code: "benchmark_session_not_found".into(), detail: "benchmark session is not active".into() })),
            },
            Request::RecentBenchmarks { limit } => {
                let runs = handler_store.recent_benchmarks(usize::from(limit)).unwrap();
                let recommendation = sori_core::recommend_benchmark(&runs).map(|run| serde_json::json!({ "run_id": run.run_id, "provider": run.provider, "model": run.model }));
                Ok(Response::Resource(sori_ipc::ResourceResponse { resource: "benchmarks".into(), value: serde_json::json!({ "runs": runs, "recommendation": recommendation }) }))
            }
            Request::RecentHistory { limit } => Ok(Response::RecentHistory(sori_ipc::RecentHistoryResponse { entries: handler_store.try_recent_history(usize::from(limit)).unwrap() })),
            Request::DeleteHistory { id } => Ok(if handler_store.try_delete_history(id).unwrap() {
                Response::Control(sori_ipc::ControlResponse { accepted: true, detail: "history entry deleted from SQLite".into() })
            } else { Response::Error(sori_ipc::IpcErrorResponse { code: "not_found".into(), detail: "history entry not found".into() }) }),
            _ => Err(sori_ipc::IpcError::UnexpectedResponse { request: Box::new(request) }),
        }
    }));
    let request = move |request| {
        tokio::task::spawn_blocking(move || {
            LocalIpcClient::connect_to(endpoint)
                .unwrap()
                .request(request)
        })
    };
    let session_id = uuid::Uuid::new_v4();
    let benchmark = tokio::spawn(request(Request::RunBenchmark {
        model: ModelId::from(MODEL),
        audio: vec![chunk(0.5)],
        reference: Some("deterministic transcript".into()),
        iterations: 3,
        session_id: Some(session_id),
        timeout_ms: None,
    }));
    let started_at = std::time::Instant::now();
    while !provider.started.load(Ordering::Acquire) {
        assert!(started_at.elapsed() < std::time::Duration::from_secs(2));
        tokio::task::yield_now().await;
    }
    assert!(
        matches!(
            request(Request::Status).await.unwrap().unwrap(),
            Response::Status(_)
        ),
        "status stays responsive during benchmark"
    );
    assert!(
        matches!(request(Request::CancelBenchmark { session_id }).await.unwrap().unwrap(), Response::Control(control) if control.accepted)
    );
    assert!(
        matches!(benchmark.await.unwrap().unwrap().unwrap(), Response::Error(error) if error.detail.contains("cancelled"))
    );
    assert!(
        matches!(request(Request::RecentBenchmarks { limit: 10 }).await.unwrap().unwrap(), Response::Resource(resource) if resource.value["runs"].as_array().unwrap().is_empty())
    );

    provider.hold.store(false, Ordering::Release);
    let successful = request(Request::RunBenchmark {
        model: ModelId::from(MODEL),
        audio: vec![chunk(0.5)],
        reference: Some("deterministic transcript".into()),
        iterations: 3,
        session_id: None,
        timeout_ms: None,
    })
    .await
    .unwrap()
    .unwrap();
    assert!(
        matches!(successful, Response::Benchmark(result) if result.accuracy.unwrap().wer == Some(0.0))
    );
    let recent = request(Request::RecentBenchmarks { limit: 10 })
        .await
        .unwrap()
        .unwrap();
    assert!(
        matches!(recent, Response::Resource(resource) if resource.value["recommendation"]["model"] == MODEL)
    );

    let entry = sori_core::HistoryEntry {
        id: uuid::Uuid::new_v4(),
        at: time::OffsetDateTime::UNIX_EPOCH,
        active_app: None,
        transcript: Transcript::plain("persisted history"),
        intent: sori_core::FastIntent::Dictation {
            text: "persisted history".into(),
        },
        route: None,
        inserted_text: None,
    };
    store.try_push_history(&entry).unwrap();
    assert!(
        matches!(request(Request::RecentHistory { limit: 10 }).await.unwrap().unwrap(), Response::RecentHistory(response) if response.entries.iter().any(|item| item.id == entry.id))
    );
    assert!(
        matches!(request(Request::DeleteHistory { id: entry.id }).await.unwrap().unwrap(), Response::Control(control) if control.accepted)
    );
    assert!(
        matches!(request(Request::DeleteHistory { id: entry.id }).await.unwrap().unwrap(), Response::Error(error) if error.code == "not_found")
    );
    task.abort();
    let _ = task.await;
    drop(store);
    let reopened = SqliteStore::open(&path).unwrap();
    assert_eq!(
        reopened.recent_benchmarks(10).unwrap().len(),
        1,
        "successful benchmark survives SQLite reopen"
    );
    assert!(
        reopened.try_recent_history(10).unwrap().is_empty(),
        "deleted history stays deleted after reopen"
    );
    drop(reopened);
    std::fs::remove_file(path).unwrap();
}

#[tokio::test]
async fn canonical_ipc_persistence_survives_daemon_restart_and_sqlite_reopen() {
    let path = std::env::temp_dir().join(format!(
        "sori-persistence-restart-{}.sqlite",
        uuid::Uuid::new_v4()
    ));
    let store = Arc::new(SqliteStore::open(&path).unwrap());
    let resource_value = serde_json::json!({"revision": 1, "items": ["persisted"]});
    let make_server = |store: Arc<SqliteStore>| async move {
        let server = LocalIpcServer::bind("127.0.0.1:0".parse().unwrap())
            .await
            .unwrap();
        let endpoint = server.local_addr().unwrap();
        let task = tokio::spawn(server.serve(move |request| {
            let response = match request {
                Request::ResourceGet { resource } => {
                    Response::Resource(sori_ipc::ResourceResponse {
                        value: store
                            .resource(&resource)
                            .unwrap()
                            .unwrap_or(serde_json::Value::Null),
                        resource,
                    })
                }
                Request::ResourceSet { resource, value } => {
                    store.set_resource(&resource, &value).unwrap();
                    Response::Resource(sori_ipc::ResourceResponse { resource, value })
                }
                Request::ResourceDelete { resource } => {
                    Response::Control(sori_ipc::ControlResponse {
                        accepted: store.delete_resource(&resource).unwrap(),
                        detail: "deleted from SQLite".into(),
                    })
                }
                Request::SettingGet { key } => Response::Setting(sori_ipc::SettingResponse {
                    value: store.setting(&key).unwrap(),
                    key,
                }),
                Request::SettingDelete { key } => {
                    let deleted = store.delete_setting(&key).unwrap();
                    if deleted {
                        Response::Setting(sori_ipc::SettingResponse { key, value: None })
                    } else {
                        Response::Error(sori_ipc::IpcErrorResponse {
                            code: "not_found".into(),
                            detail: "setting not found".into(),
                        })
                    }
                }
                Request::SetConfig { key, value } => {
                    store.set_setting(&key, &value).unwrap();
                    Response::Control(sori_ipc::ControlResponse {
                        accepted: true,
                        detail: "setting persisted".into(),
                    })
                }
                Request::RecentHistory { limit } => {
                    Response::RecentHistory(sori_ipc::RecentHistoryResponse {
                        entries: store.try_recent_history(usize::from(limit)).unwrap(),
                    })
                }
                Request::DeleteHistory { id } => Response::Control(sori_ipc::ControlResponse {
                    accepted: store.try_delete_history(id).unwrap(),
                    detail: "history deleted".into(),
                }),
                _ => {
                    return Err(sori_ipc::IpcError::UnexpectedResponse {
                        request: Box::new(request),
                    });
                }
            };
            Ok(response)
        }));
        (endpoint, task)
    };
    let (endpoint, first) = make_server(Arc::clone(&store)).await;
    let request = |request| async move {
        tokio::task::spawn_blocking(move || {
            LocalIpcClient::connect_to(endpoint)
                .unwrap()
                .request(request)
        })
        .await
        .unwrap()
        .unwrap()
    };
    for resource in ["settings", "vocabulary", "snippets", "route", "models"] {
        assert!(matches!(
            request(Request::ResourceSet {
                resource: resource.into(),
                value: resource_value.clone()
            })
            .await,
            Response::Resource(_)
        ));
    }
    assert!(
        matches!(request(Request::SetConfig { key: "history.enabled".into(), value: serde_json::json!(true) }).await, Response::Control(control) if control.accepted)
    );
    assert!(
        matches!(request(Request::SetConfig { key: "history.enabled".into(), value: serde_json::json!(true) }).await, Response::Control(control) if control.accepted)
    );
    assert!(
        matches!(request(Request::SettingGet { key: "history.enabled".into() }).await, Response::Setting(setting) if setting.value == Some(serde_json::json!(true)))
    );
    assert!(
        matches!(request(Request::SettingGet { key: "audio.device_id".into() }).await, Response::Setting(setting) if setting.value.is_none())
    );
    first.abort();
    let _ = first.await;
    drop(store);

    let reopened = Arc::new(SqliteStore::open(&path).unwrap());
    let (restarted_endpoint, second) = make_server(Arc::clone(&reopened)).await;
    let read = |resource: &'static str| async move {
        tokio::task::spawn_blocking(move || {
            LocalIpcClient::connect_to(restarted_endpoint)
                .unwrap()
                .request(Request::ResourceGet {
                    resource: resource.into(),
                })
        })
        .await
        .unwrap()
        .unwrap()
    };
    for resource in ["settings", "vocabulary", "snippets", "route", "models"] {
        assert!(
            matches!(read(resource).await, Response::Resource(value) if value.value == resource_value)
        );
    }
    for resource in ["settings", "vocabulary", "snippets", "route", "models"] {
        assert!(
            matches!(read(resource).await, Response::Resource(value) if value.value == resource_value)
        );
    }
    assert!(
        matches!(tokio::task::spawn_blocking(move || LocalIpcClient::connect_to(restarted_endpoint).unwrap().request(Request::SettingGet { key: "history.enabled".into() })).await.unwrap().unwrap(), Response::Setting(setting) if setting.value == Some(serde_json::json!(true)))
    );
    assert!(
        matches!(tokio::task::spawn_blocking(move || LocalIpcClient::connect_to(restarted_endpoint).unwrap().request(Request::SettingDelete { key: "history.enabled".into() })).await.unwrap().unwrap(), Response::Setting(setting) if setting.value.is_none())
    );
    assert!(
        matches!(tokio::task::spawn_blocking(move || LocalIpcClient::connect_to(restarted_endpoint).unwrap().request(Request::ResourceDelete { resource: "snippets".into() })).await.unwrap().unwrap(), Response::Control(control) if control.accepted)
    );
    assert!(reopened.resource("snippets").unwrap().is_none());
    second.abort();
    let _ = second.await;
    drop(reopened);
    std::fs::remove_file(path).unwrap();
}

#[tokio::test]
async fn daemon_setting_delete_resets_live_state_and_survives_restart() {
    let database = std::env::temp_dir().join(format!("sori-setting-delete-{}.sqlite", uuid::Uuid::new_v4()));
    let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let endpoint = format!("127.0.0.1:{port}");
    let start = || {
        Command::new(env!("CARGO_BIN_EXE_sorid"))
            .env("SORI_DATABASE_PATH", &database)
            .env("SORI_IPC_ADDR", &endpoint)
            .env("SORI_HOTKEY_OVERRIDE", "Alt+Space")
            .env_remove("SORI_WHISPER_CPP_BIN")
            .spawn()
            .unwrap()
    };
    let mut daemon = KillOnDrop(Some(start()));
    let endpoint_addr = endpoint.parse().unwrap();
    let request = |request: Request| -> Response {
        for _ in 0..100 {
            if let Ok(client) = LocalIpcClient::connect_to(endpoint_addr) {
                if let Ok(response) = client.request(request.clone()) {
                    return response;
                }
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        panic!("sorid did not become ready at {endpoint}");
    };
    let set = |key: &str, value: serde_json::Value| {
        let response = request(Request::SetConfig { key: key.into(), value });
        assert!(matches!(&response, Response::Control(control) if control.accepted), "{key}: {response:?}");
    };
    set("hotkey.binding", serde_json::json!("Ctrl+Alt+S"));
    set("audio.device_id", serde_json::json!("deterministic-device"));
    set("privacy.mode", serde_json::json!("CloudAllowed"));
    set("route.policy", serde_json::json!("Performance"));
    assert!(matches!(request(Request::Status), Response::Status(status) if status.hotkey == "Ctrl+Alt+S" && status.privacy == sori_core::PrivacyMode::CloudAllowed && !status.route.prefer_local && status.route.allow_cloud && status.route.prefer_warm_runtime));
    assert!(matches!(request(Request::ResourceGet { resource: "route".into() }), Response::Resource(resource) if resource.value["policy"] == "Performance"));

    for key in ["hotkey.binding", "audio.device_id", "privacy.mode", "route.policy"] {
        let response = request(Request::SettingDelete { key: key.into() });
        assert!(matches!(&response, Response::Setting(setting) if setting.value.is_none()), "{key}: {response:?}");
    }
    assert!(matches!(request(Request::Status), Response::Status(status) if status.hotkey == "Alt+Space" && status.privacy == sori_core::PrivacyMode::LocalOnly && status.route.prefer_local && status.route.allow_cloud && !status.route.prefer_warm_runtime && !status.route.optimize_battery));
    assert!(matches!(request(Request::SettingGet { key: "audio.device_id".into() }), Response::Setting(setting) if setting.value.is_none()));
    assert!(matches!(request(Request::ResourceGet { resource: "route".into() }), Response::Resource(resource) if resource.value["policy"] == "LocalFirst"));

    daemon.0.as_mut().unwrap().kill().unwrap();
    let _ = daemon.0.as_mut().unwrap().wait();
    daemon.0 = None;
    let mut restarted = KillOnDrop(Some(start()));
    let restarted_status = loop {
        if let Ok(client) = LocalIpcClient::connect_to(endpoint_addr) {
            if let Ok(Response::Status(status)) = client.request(Request::Status) {
                break status;
            }
        }
        std::thread::sleep(Duration::from_millis(25));
    };
    assert_eq!(restarted_status.hotkey, "Alt+Space");
    assert_eq!(restarted_status.privacy, sori_core::PrivacyMode::LocalOnly);
    assert!(matches!(LocalIpcClient::connect_to(endpoint_addr).unwrap().request(Request::ResourceGet { resource: "route".into() }).unwrap(), Response::Resource(resource) if resource.value["policy"] == "LocalFirst"));
    restarted.0.as_mut().unwrap().kill().unwrap();
    let _ = restarted.0.as_mut().unwrap().wait();
    restarted.0 = None;
    let _ = std::fs::remove_file(database);
}
