//! Deterministic backend-only E2E seam.
//!
//! This test speaks the real loopback IPC transport and supplies fakes only at
//! the audio, provider, and injector boundaries. It intentionally does not
//! import the desktop application or the IPC mock transport.

use sori_core::{
    AudioCaptureEngine, AudioChunk, AudioEngine, AudioError, AudioFormat, EventKind,
    InjectorCapabilities, ModelError, ModelId, ModelProvider, ModelRoute, SampleFormat,
    TextInjectionError, TextInjectionRequest, TextInjectionResult, TextInjector, TextTarget,
    TextTargetCapabilities, Transcript, run_dictation,
};
use sori_ipc::{IpcClient, LocalIpcClient, LocalIpcServer, Request, Response};
use sori_persistence::SqliteStore;
use sorid::{DaemonRuntime, SharedEventBus};
use std::sync::{Arc, Mutex};
use time::OffsetDateTime;

const MODEL: &str = "fake-whisper";

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
