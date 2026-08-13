//! Non-blocking daemon lifecycle state machine.

use sori_core::{
    AudioCaptureEngine, AudioChunk, AudioError, EnergyVadStub, EventBus, EventKind,
    HistoryRepository, ModelError, ModelId, ModelProvider, ModelRoute, TextInjector, TextTarget,
    Transcript, VoiceActivity, VoiceActivityDetector, complete_dictation,
    event::serde_json_like::Value,
};
use std::sync::Arc;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeState {
    Ready,
    Paused,
    Error(String),
    ShuttingDown,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum RuntimeTransitionError {
    #[error("cannot transition from {state:?} to {operation}")]
    InvalidTransition {
        state: RuntimeState,
        operation: &'static str,
    },
}

pub struct DaemonRuntime<B> {
    state: RuntimeState,
    events: B,
    provider: Option<Arc<dyn ModelProvider>>,
    audio: Option<Box<dyn AudioCaptureEngine>>,
    audio_session: Option<AudioSession>,
    captured_audio: Vec<AudioChunk>,
}

struct AudioSession {
    vad: EnergyVadStub,
    chunks: usize,
}

impl<B: EventBus> DaemonRuntime<B> {
    pub fn new(events: B) -> Self {
        let runtime = Self {
            state: RuntimeState::Ready,
            events,
            provider: None,
            audio: None,
            audio_session: None,
            captured_audio: Vec::new(),
        };
        runtime.publish(EventKind::DaemonReady, Value::Null);
        runtime
    }

    pub fn new_with_provider(events: B, provider: Arc<dyn ModelProvider>) -> Self {
        let runtime = Self {
            state: RuntimeState::Ready,
            events,
            provider: Some(provider),
            audio: None,
            audio_session: None,
            captured_audio: Vec::new(),
        };
        runtime.publish(EventKind::DaemonReady, Value::Null);
        runtime
    }

    pub fn set_audio_engine(&mut self, engine: Box<dyn AudioCaptureEngine>) {
        self.audio = Some(engine);
        self.publish_capability(
            "audio",
            true,
            "capture adapter configured; device proof requires a session",
        );
    }

    pub fn publish_capability(&self, name: &str, available: bool, detail: impl Into<String>) {
        self.publish(
            if available {
                EventKind::CapabilityAvailable
            } else {
                EventKind::CapabilityUnavailable
            },
            Value::String(format!("{name}: {}", detail.into())),
        );
    }

    pub fn audio_available(&self) -> bool {
        self.audio.is_some()
    }

    /// Start the real input stream. Success is reported only after CPAL starts it.
    pub fn start_audio(&mut self) -> Result<(), AudioError> {
        if self.audio_session.is_some() {
            return Err(AudioError::Pipeline(
                "dictation session is already running".into(),
            ));
        }
        if self.audio.is_none() {
            let error = AudioError::BackendUnavailable("microphone capture is unavailable".into());
            self.publish_capability("audio", false, error.to_string());
            return Err(error);
        }
        let engine = self.audio.as_mut().expect("audio presence checked");
        let device = match engine.start_capture() {
            Ok(device) => device,
            Err(error) => {
                self.publish(EventKind::AudioError, Value::String(error.to_string()));
                return Err(error);
            }
        };
        self.audio_session = Some(AudioSession {
            vad: EnergyVadStub::new(0.02),
            chunks: 0,
        });
        self.publish(EventKind::AudioStarted, Value::String(device.name));
        Ok(())
    }

    /// Consume at most 64 chunks; ASR and insertion intentionally remain separate.
    pub fn stop_audio(&mut self, cancelled: bool) -> Result<usize, AudioError> {
        let mut session = self
            .audio_session
            .take()
            .ok_or_else(|| AudioError::Pipeline("no dictation session is running".into()))?;
        let mut captured = Vec::new();
        let result: Result<usize, AudioError> = (|| {
            for _ in 0..64 {
                let next = self
                    .audio
                    .as_mut()
                    .ok_or_else(|| {
                        AudioError::BackendUnavailable("microphone capture is unavailable".into())
                    })?
                    .next_chunk()?;
                let Some(chunk) = next else { break };
                session.chunks += 1;
                captured.push(chunk.clone());
                self.publish(
                    EventKind::AudioChunkCaptured,
                    Value::Number(session.chunks as i64),
                );
                match session.vad.process(&chunk.samples) {
                    VoiceActivity::SpeechStarted => {
                        self.publish(EventKind::VadSpeechStarted, Value::Null)
                    }
                    VoiceActivity::SpeechEnded => {
                        self.publish(EventKind::VadSpeechEnded, Value::Null);
                        break;
                    }
                    VoiceActivity::Silence | VoiceActivity::SpeechContinues => {}
                }
            }
            if let Some(engine) = self.audio.as_mut() {
                engine.stop_capture();
            }
            self.captured_audio = captured;
            Ok(session.chunks)
        })();
        if let Err(error) = &result {
            if let Some(engine) = self.audio.as_mut() {
                engine.stop_capture();
            }
            self.publish(EventKind::AudioError, Value::String(error.to_string()));
        }
        if cancelled {
            self.publish(EventKind::DictationCancelled, Value::Null);
        }
        self.publish(
            EventKind::AudioStopped,
            Value::Number(session.chunks as i64),
        );
        result
    }

    /// Transcribe captured chunks through the configured provider boundary.
    /// Return the most recently stopped capture exactly once.
    pub fn take_captured_audio(&mut self) -> Vec<AudioChunk> {
        std::mem::take(&mut self.captured_audio)
    }

    pub fn transcribe(
        &self,
        model: &ModelId,
        audio: &[AudioChunk],
    ) -> Result<Transcript, ModelError> {
        self.provider
            .as_deref()
            .ok_or_else(|| ModelError::Inference("no model provider is configured".into()))?
            .transcribe(model, audio)
    }

    pub fn whisper_available(&self) -> bool {
        self.provider.is_some()
    }

    pub fn transcribe_captured(&mut self, model: &ModelId) -> Result<Transcript, ModelError> {
        let audio = self.take_captured_audio();
        self.publish(EventKind::AsrSelected, Value::String(model.0.clone()));
        match self.transcribe(model, &audio) {
            Ok(transcript) => {
                self.publish(
                    EventKind::TranscriptFinal,
                    Value::String(transcript.text.clone()),
                );
                Ok(transcript)
            }
            Err(error) => {
                self.publish(
                    EventKind::AudioError,
                    Value::String(format!("ASR: {error}")),
                );
                Err(error)
            }
        }
    }

    pub fn complete_captured_dictation(
        &mut self,
        route: &ModelRoute,
        injector: &mut dyn TextInjector,
        target: &dyn TextTarget,
        history: &dyn HistoryRepository,
    ) -> Result<sori_core::DictationResult, sori_core::PipelineError> {
        let audio = self.take_captured_audio();
        let provider = self.provider.as_deref().ok_or_else(|| {
            sori_core::PipelineError::Asr(ModelError::Inference(
                "no model provider is configured".into(),
            ))
        })?;
        complete_dictation(
            audio,
            provider,
            injector,
            target,
            route,
            history,
            &self.events,
        )
    }

    pub fn handle_hotkey(&mut self, event: sori_core::HotkeyEvent, model: &ModelId) {
        let result: Result<(), String> = match event {
            sori_core::HotkeyEvent::Pressed => self
                .start_audio()
                .map(|_| ())
                .map_err(|error| error.to_string()),
            sori_core::HotkeyEvent::Released => (|| {
                self.stop_audio(false).map_err(|error| error.to_string())?;
                self.transcribe_captured(model)
                    .map(|_| ())
                    .map_err(|error| error.to_string())
            })(),
            sori_core::HotkeyEvent::Cancelled => self
                .stop_audio(true)
                .map(|_| ())
                .map_err(|error| error.to_string()),
        };
        if let Err(error) = result {
            self.publish(
                EventKind::AudioError,
                Value::String(format!("hotkey: {error}")),
            );
        }
    }

    pub fn state(&self) -> &RuntimeState {
        &self.state
    }
    pub fn events(&self) -> &B {
        &self.events
    }

    pub fn pause(&mut self) -> Result<(), RuntimeTransitionError> {
        self.transition(RuntimeState::Paused, EventKind::DaemonPaused, "pause")
    }
    pub fn resume(&mut self) -> Result<(), RuntimeTransitionError> {
        self.transition(RuntimeState::Ready, EventKind::DaemonReady, "resume")
    }
    pub fn fail(&mut self, reason: impl Into<String>) -> Result<(), RuntimeTransitionError> {
        let reason = reason.into();
        if matches!(self.state, RuntimeState::ShuttingDown) {
            return Err(RuntimeTransitionError::InvalidTransition {
                state: self.state.clone(),
                operation: "fail",
            });
        }
        self.state = RuntimeState::Error(reason.clone());
        self.publish(EventKind::DaemonError, Value::String(reason));
        Ok(())
    }
    pub fn shutdown(&mut self) -> Result<(), RuntimeTransitionError> {
        if matches!(self.state, RuntimeState::ShuttingDown) {
            return Err(RuntimeTransitionError::InvalidTransition {
                state: self.state.clone(),
                operation: "shutdown",
            });
        }
        self.state = RuntimeState::ShuttingDown;
        self.publish(EventKind::DaemonShuttingDown, Value::Null);
        Ok(())
    }
    fn transition(
        &mut self,
        next: RuntimeState,
        event: EventKind,
        operation: &'static str,
    ) -> Result<(), RuntimeTransitionError> {
        if matches!(self.state, RuntimeState::ShuttingDown) {
            return Err(RuntimeTransitionError::InvalidTransition {
                state: self.state.clone(),
                operation,
            });
        }
        self.state = next;
        self.publish(event, Value::Null);
        Ok(())
    }
    fn publish(&self, kind: EventKind, payload: Value) {
        self.events.publish(sori_core::Event {
            id: uuid::Uuid::new_v4(),
            at: time::OffsetDateTime::now_utc(),
            kind,
            payload,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sori_core::{AudioEngine, AudioFormat, EventKind, InMemoryEventBus, SampleFormat};
    struct FakeCapture {
        chunks: Vec<AudioChunk>,
        started: bool,
        stopped: bool,
    }
    impl AudioEngine for FakeCapture {
        fn input_format(&self) -> sori_core::AudioFormat {
            sori_core::AudioFormat {
                sample_rate_hz: 16_000,
                channels: 1,
                sample_format: sori_core::SampleFormat::F32,
            }
        }
        fn next_chunk(&mut self) -> Result<Option<AudioChunk>, AudioError> {
            Ok(if self.chunks.is_empty() {
                None
            } else {
                Some(self.chunks.remove(0))
            })
        }
    }
    impl AudioCaptureEngine for FakeCapture {
        fn start_capture(&mut self) -> Result<sori_core::AudioDeviceInfo, AudioError> {
            self.started = true;
            Ok(sori_core::AudioDeviceInfo {
                id: "fake".into(),
                name: "fake microphone".into(),
                is_default_input: true,
            })
        }
        fn stop_capture(&mut self) {
            self.stopped = true;
        }
        fn is_running(&self) -> bool {
            self.started && !self.stopped
        }
    }

    struct FakeProvider;
    impl ModelProvider for FakeProvider {
        fn provider_name(&self) -> &'static str {
            "fake"
        }
        fn can_transcribe(&self, _: &ModelId) -> bool {
            true
        }
        fn transcribe(&self, _: &ModelId, audio: &[AudioChunk]) -> Result<Transcript, ModelError> {
            Ok(Transcript::plain(format!(
                "fake transcript ({} chunks)",
                audio.len()
            )))
        }
    }

    fn fake_chunk(value: f32) -> AudioChunk {
        AudioChunk {
            captured_at: time::OffsetDateTime::UNIX_EPOCH,
            format: AudioFormat {
                sample_rate_hz: 16_000,
                channels: 1,
                sample_format: SampleFormat::F32,
            },
            samples: vec![value],
        }
    }

    #[test]
    fn hotkey_lifecycle_runs_fake_capture_and_provider() {
        let events = InMemoryEventBus::default();
        let mut runtime = DaemonRuntime::new_with_provider(events.clone(), Arc::new(FakeProvider));
        runtime.set_audio_engine(Box::new(FakeCapture {
            chunks: vec![fake_chunk(0.5), fake_chunk(0.0)],
            started: false,
            stopped: false,
        }));
        let model = ModelId::from("fake-model");
        runtime.handle_hotkey(sori_core::HotkeyEvent::Pressed, &model);
        runtime.handle_hotkey(sori_core::HotkeyEvent::Released, &model);
        let kinds = events
            .recent()
            .into_iter()
            .map(|event| event.kind)
            .collect::<Vec<_>>();
        assert!(kinds.contains(&EventKind::AudioStarted));
        assert!(kinds.contains(&EventKind::AudioStopped));
        assert!(kinds.contains(&EventKind::AsrSelected));
        assert!(kinds.contains(&EventKind::TranscriptFinal));
    }
    #[test]
    fn fake_capture_session_publishes_vad_and_stop_without_asr() {
        let events = InMemoryEventBus::default();
        let mut runtime = DaemonRuntime::new(events.clone());
        runtime.set_audio_engine(Box::new(FakeCapture {
            chunks: vec![
                AudioChunk {
                    captured_at: time::OffsetDateTime::UNIX_EPOCH,
                    format: AudioFormat {
                        sample_rate_hz: 16_000,
                        channels: 1,
                        sample_format: SampleFormat::F32,
                    },
                    samples: vec![0.5],
                },
                AudioChunk {
                    captured_at: time::OffsetDateTime::UNIX_EPOCH,
                    format: AudioFormat {
                        sample_rate_hz: 16_000,
                        channels: 1,
                        sample_format: SampleFormat::F32,
                    },
                    samples: vec![0.0],
                },
            ],
            started: false,
            stopped: false,
        }));
        runtime.start_audio().unwrap();
        assert_eq!(runtime.stop_audio(false).unwrap(), 2);
        assert_eq!(runtime.take_captured_audio().len(), 2);
        assert!(runtime.take_captured_audio().is_empty());
        let kinds = events
            .recent()
            .into_iter()
            .map(|event| event.kind)
            .collect::<Vec<_>>();
        assert!(kinds.contains(&EventKind::AudioStarted));
        assert!(kinds.contains(&EventKind::AudioChunkCaptured));
        assert!(kinds.contains(&EventKind::VadSpeechStarted));
        assert!(kinds.contains(&EventKind::VadSpeechEnded));
        assert!(kinds.contains(&EventKind::AudioStopped));
    }

    #[test]
    fn lifecycle_transitions_publish_events() {
        let events = InMemoryEventBus::default();
        let mut runtime = DaemonRuntime::new(events.clone());
        assert_eq!(runtime.state(), &RuntimeState::Ready);
        runtime.pause().unwrap();
        runtime.resume().unwrap();
        runtime.shutdown().unwrap();
        assert_eq!(runtime.state(), &RuntimeState::ShuttingDown);
        assert_eq!(
            events
                .recent()
                .iter()
                .map(|event| event.kind.clone())
                .collect::<Vec<_>>(),
            vec![
                EventKind::DaemonReady,
                EventKind::DaemonPaused,
                EventKind::DaemonReady,
                EventKind::DaemonShuttingDown
            ]
        );
    }
    #[test]
    fn shutdown_is_terminal_and_errors_are_observable() {
        let events = InMemoryEventBus::default();
        let mut runtime = DaemonRuntime::new(events.clone());
        runtime.fail("audio unavailable").unwrap();
        assert_eq!(
            runtime.state(),
            &RuntimeState::Error("audio unavailable".into())
        );
        runtime.shutdown().unwrap();
        assert!(runtime.resume().is_err());
        assert!(
            events
                .recent()
                .iter()
                .any(|event| event.kind == EventKind::DaemonError)
        );
    }
}
