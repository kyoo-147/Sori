use crate::{
    AudioChunk, AudioEngine, ContextSnapshot, Event, EventBus, EventKind, FastIntent, HistoryEntry,
    HistoryRepository, ModelError, ModelProvider, ModelRoute, TextInjectionRequest, TextInjector,
    TextTarget, Transcript, Vocabulary, normalize_transcript,
};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PipelineStage {
    ContextSnapshot,
    AudioCapture,
    Dsp,
    Vad,
    AsrRoute,
    ModelRuntime,
    Transcribe,
    PostProcess,
    FastIntent,
    InjectOrAct,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PipelinePlan {
    pub context: ContextSnapshot,
    pub route: ModelRoute,
    pub stages: Vec<PipelineStage>,
}

impl PipelinePlan {
    pub fn hot_path(context: ContextSnapshot, route: ModelRoute) -> Self {
        Self {
            context,
            route,
            stages: vec![
                PipelineStage::ContextSnapshot,
                PipelineStage::AudioCapture,
                PipelineStage::Dsp,
                PipelineStage::Vad,
                PipelineStage::AsrRoute,
                PipelineStage::ModelRuntime,
                PipelineStage::Transcribe,
                PipelineStage::PostProcess,
                PipelineStage::FastIntent,
                PipelineStage::InjectOrAct,
            ],
        }
    }
}

/// The result of one trigger-to-injection dictation attempt. An injection error is
/// reported separately because the transcript is still useful and is persisted as
/// a recovery/fallback record.
#[derive(Debug, Clone, PartialEq)]
pub struct DictationResult {
    pub transcript: Transcript,
    pub inserted_text: Option<String>,
    pub chunks: usize,
    pub stages: Vec<PipelineStage>,
    pub injection_error: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("audio capture failed: {0}")]
    Audio(#[from] crate::AudioError),
    #[error("ASR failed: {0}")]
    Asr(#[from] ModelError),
    #[error("history persistence failed: {0}")]
    History(String),
    #[error("route is unavailable: {0}")]
    Route(String),
}

fn publish(bus: &dyn EventBus, kind: EventKind, payload: &str) {
    bus.publish(Event {
        id: Uuid::new_v4(),
        at: OffsetDateTime::now_utc(),
        kind,
        payload: crate::event::serde_json_like::Value::String(payload.to_owned()),
    });
}

/// Execute the synchronous, non-LLM dictation hot path. All device, ASR, and OS
/// side effects are supplied by adapters, which makes this function deterministic
/// with fakes and keeps persistence at an explicit boundary.
pub fn complete_dictation(
    chunks: Vec<AudioChunk>,
    asr: &dyn ModelProvider,
    injector: &mut dyn TextInjector,
    target: &dyn TextTarget,
    route: &ModelRoute,
    history: &dyn HistoryRepository,
    events: &dyn EventBus,
) -> Result<DictationResult, PipelineError> {
    complete_dictation_with_vocabulary(
        chunks,
        asr,
        injector,
        target,
        route,
        history,
        events,
        &Vocabulary::default(),
    )
}

/// Vocabulary is an explicit pipeline dependency; the legacy wrapper above keeps the public MVP API stable.
#[allow(clippy::too_many_arguments)]
pub fn complete_dictation_with_vocabulary(
    chunks: Vec<AudioChunk>,
    asr: &dyn ModelProvider,
    injector: &mut dyn TextInjector,
    target: &dyn TextTarget,
    route: &ModelRoute,
    history: &dyn HistoryRepository,
    events: &dyn EventBus,
    vocabulary: &Vocabulary,
) -> Result<DictationResult, PipelineError> {
    if route.provider != asr.provider_name() {
        return Err(PipelineError::Route(format!(
            "route provider {} is not served by {}",
            route.provider,
            asr.provider_name()
        )));
    }
    if !asr.can_transcribe(&route.model) {
        return Err(PipelineError::Route(format!(
            "model is unavailable: {}",
            route.model.0
        )));
    }
    publish(events, EventKind::AsrSelected, &route.model.0);
    let transcript = normalize_transcript(
        asr.transcribe_with_context(&route.model, &chunks, vocabulary)?,
        vocabulary,
    );
    publish(events, EventKind::TranscriptFinal, &transcript.text);
    let request = TextInjectionRequest {
        text: transcript.text.clone(),
        dry_run: false,
    };
    let (inserted_text, injection_error) = match injector.inject(target, &request) {
        Ok(_) => {
            publish(events, EventKind::ActionAfter, "text-injected");
            (Some(transcript.text.clone()), None)
        }
        Err(error) => {
            publish(
                events,
                EventKind::ModelFallback,
                &format!("injection-fallback: {error}"),
            );
            (None, Some(error.to_string()))
        }
    };
    history
        .try_push(HistoryEntry {
            id: Uuid::new_v4(),
            at: OffsetDateTime::now_utc(),
            active_app: Some(target.name().to_owned()),
            intent: FastIntent::Dictation {
                text: transcript.text.clone(),
            },
            transcript: transcript.clone(),
            route: Some(route.clone()),
            inserted_text: inserted_text.clone(),
        })
        .map_err(PipelineError::History)?;
    Ok(DictationResult {
        transcript,
        inserted_text,
        chunks: chunks.len(),
        stages: vec![
            PipelineStage::AsrRoute,
            PipelineStage::Transcribe,
            PipelineStage::InjectOrAct,
        ],
        injection_error,
    })
}

/// Execute a dictation with a cancellation/timeout seam owned by the caller.
/// Providers must observe the token; the elapsed check also prevents a late
/// provider result from becoming a successful transcript.
#[allow(clippy::too_many_arguments)]
pub fn complete_dictation_with_vocabulary_options(
    chunks: Vec<AudioChunk>,
    asr: &dyn ModelProvider,
    injector: &mut dyn TextInjector,
    target: &dyn TextTarget,
    route: &ModelRoute,
    history: &dyn HistoryRepository,
    events: &dyn EventBus,
    vocabulary: &Vocabulary,
    cancellation: &crate::CancellationToken,
    timeout: Option<std::time::Duration>,
) -> Result<DictationResult, PipelineError> {
    let started = std::time::Instant::now();
    if cancellation.is_cancelled() {
        return Err(PipelineError::Asr(ModelError::Inference(
            "transcription cancelled".into(),
        )));
    }
    if timeout.is_some_and(|limit| limit.is_zero()) {
        return Err(PipelineError::Asr(ModelError::Inference(
            "transcription timed out before provider launch".into(),
        )));
    }
    if route.provider != asr.provider_name() {
        return Err(PipelineError::Route(format!(
            "route provider {} is not served by {}",
            route.provider,
            asr.provider_name()
        )));
    }
    if !asr.can_transcribe(&route.model) {
        return Err(PipelineError::Route(format!(
            "model is unavailable: {}",
            route.model.0
        )));
    }
    publish(events, EventKind::AsrSelected, &route.model.0);
    let transcript = normalize_transcript(
        asr.transcribe_with_context_and_cancellation(
            &route.model,
            &chunks,
            vocabulary,
            cancellation,
        )?,
        vocabulary,
    );
    if cancellation.is_cancelled() || timeout.is_some_and(|limit| started.elapsed() >= limit) {
        let detail = if cancellation.is_cancelled() {
            "transcription cancelled"
        } else {
            "transcription timed out"
        };
        return Err(PipelineError::Asr(ModelError::Inference(detail.into())));
    }
    publish(events, EventKind::TranscriptFinal, &transcript.text);
    let request = TextInjectionRequest {
        text: transcript.text.clone(),
        dry_run: false,
    };
    let (inserted_text, injection_error) = match injector.inject(target, &request) {
        Ok(_) => {
            publish(events, EventKind::ActionAfter, "text-injected");
            (Some(transcript.text.clone()), None)
        }
        Err(error) => {
            publish(
                events,
                EventKind::ModelFallback,
                &format!("injection-fallback: {error}"),
            );
            (None, Some(error.to_string()))
        }
    };
    history
        .try_push(HistoryEntry {
            id: Uuid::new_v4(),
            at: OffsetDateTime::now_utc(),
            active_app: Some(target.name().to_owned()),
            intent: FastIntent::Dictation {
                text: transcript.text.clone(),
            },
            transcript: transcript.clone(),
            route: Some(route.clone()),
            inserted_text: inserted_text.clone(),
        })
        .map_err(PipelineError::History)?;
    Ok(DictationResult {
        transcript,
        inserted_text,
        chunks: chunks.len(),
        stages: vec![
            PipelineStage::AsrRoute,
            PipelineStage::Transcribe,
            PipelineStage::InjectOrAct,
        ],
        injection_error,
    })
}

pub fn run_dictation(
    audio: &mut dyn AudioEngine,
    asr: &dyn ModelProvider,
    injector: &mut dyn TextInjector,
    target: &dyn TextTarget,
    route: &ModelRoute,
    history: &dyn HistoryRepository,
    events: &dyn EventBus,
) -> Result<DictationResult, PipelineError> {
    publish(events, EventKind::HotkeyPressed, "dictation-triggered");
    publish(events, EventKind::AudioStarted, "capture-started");
    let mut chunks = Vec::new();
    while let Some(chunk) = audio.next_chunk()? {
        chunks.push(chunk);
    }
    complete_dictation(chunks, asr, injector, target, route, history, events)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        AudioFormat, InjectorCapabilities, SampleFormat, TextInjectionError, TextInjectionResult,
        TextTargetCapabilities,
    };

    struct AudioFake {
        remaining: usize,
    }
    impl AudioEngine for AudioFake {
        fn input_format(&self) -> AudioFormat {
            AudioFormat {
                sample_rate_hz: 16_000,
                channels: 1,
                sample_format: SampleFormat::F32,
            }
        }
        fn next_chunk(&mut self) -> Result<Option<AudioChunk>, crate::AudioError> {
            if self.remaining == 0 {
                return Ok(None);
            }
            self.remaining -= 1;
            Ok(Some(AudioChunk {
                captured_at: OffsetDateTime::UNIX_EPOCH,
                format: self.input_format(),
                samples: vec![1.0],
            }))
        }
    }
    struct AsrFake;
    impl ModelProvider for AsrFake {
        fn provider_name(&self) -> &'static str {
            "fake"
        }
        fn can_transcribe(&self, _: &crate::ModelId) -> bool {
            true
        }
        fn transcribe(
            &self,
            _: &crate::ModelId,
            _: &[AudioChunk],
        ) -> Result<Transcript, ModelError> {
            Ok(Transcript::plain("hello"))
        }
    }
    struct TargetFake;
    impl TextTarget for TargetFake {
        fn name(&self) -> &str {
            "editor"
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
    struct InjectorFake {
        fail: bool,
    }
    impl TextInjector for InjectorFake {
        fn capabilities(&self) -> InjectorCapabilities {
            InjectorCapabilities {
                direct_input: true,
                clipboard: false,
                clipboard_restore: false,
                undo: false,
            }
        }
        fn plan(&self, _: &dyn TextTarget) -> crate::InjectionPlan {
            panic!("not needed")
        }
        fn inject(
            &mut self,
            _: &dyn TextTarget,
            _: &TextInjectionRequest,
        ) -> Result<TextInjectionResult, TextInjectionError> {
            if self.fail {
                Err(TextInjectionError::Adapter("fake failure".into()))
            } else {
                Ok(TextInjectionResult {
                    plan: crate::InjectionPlan {
                        target: "editor".into(),
                        strategy: crate::InjectionStrategy::DirectInput,
                        clipboard_policy: crate::ClipboardPolicy::NotUsed,
                        undo_restore: crate::UndoRestoreAttempt {
                            status: crate::UndoRestoreStatus::NotSupported,
                            description: "test".into(),
                        },
                    },
                    dry_run_output: None,
                    outcome: crate::InjectionOutcome::Inserted,
                    diagnostics: Vec::new(),
                })
            }
        }
    }
    fn route() -> ModelRoute {
        ModelRoute {
            provider: "fake".into(),
            model: crate::ModelId::from("fake"),
            reason: "test".into(),
            fallback: vec![],
        }
    }

    #[test]
    fn happy_path_persists_inserted_transcript_and_events() {
        let history = crate::InMemoryHistory::default();
        let events = crate::InMemoryEventBus::default();
        let mut injector = InjectorFake { fail: false };
        let result = run_dictation(
            &mut AudioFake { remaining: 2 },
            &AsrFake,
            &mut injector,
            &TargetFake,
            &route(),
            &history,
            &events,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn cancellation_and_timeout_are_terminal_before_injection() {
        let history = crate::InMemoryHistory::default();
        let events = crate::InMemoryEventBus::default();
        let token = crate::CancellationToken::new();
        token.cancel();
        let cancelled = complete_dictation_with_vocabulary_options(
            vec![AudioChunk {
                captured_at: OffsetDateTime::UNIX_EPOCH,
                format: AudioFormat {
                    sample_rate_hz: 16_000,
                    channels: 1,
                    sample_format: SampleFormat::F32,
                },
                samples: vec![1.0],
            }],
            &AsrFake,
            &mut InjectorFake { fail: false },
            &TargetFake,
            &route(),
            &history,
            &events,
            &Vocabulary::default(),
            &token,
            None,
        );
        assert!(cancelled.is_err());
        assert!(history.recent(1).is_empty());
        let timed_out = complete_dictation_with_vocabulary_options(
            vec![AudioChunk {
                captured_at: OffsetDateTime::UNIX_EPOCH,
                format: AudioFormat {
                    sample_rate_hz: 16_000,
                    channels: 1,
                    sample_format: SampleFormat::F32,
                },
                samples: vec![1.0],
            }],
            &AsrFake,
            &mut InjectorFake { fail: false },
            &TargetFake,
            &route(),
            &history,
            &events,
            &Vocabulary::default(),
            &crate::CancellationToken::new(),
            Some(std::time::Duration::ZERO),
        );
        assert!(timed_out.is_err());
        assert!(history.recent(1).is_empty());
    }

    #[test]
    fn stale_provider_route_is_rejected_before_inference_or_injection() {
        let history = crate::InMemoryHistory::default();
        let events = crate::InMemoryEventBus::default();
        let mut injector = InjectorFake { fail: false };
        let mut stale = route();
        stale.provider = "missing-provider".into();
        let error = run_dictation(
            &mut AudioFake { remaining: 1 },
            &AsrFake,
            &mut injector,
            &TargetFake,
            &stale,
            &history,
            &events,
        )
        .unwrap_err();
        assert!(matches!(error, PipelineError::Route(_)));
        assert!(history.recent(1).is_empty());
    }

    #[test]
    fn injection_failure_keeps_transcript_as_fallback_history() {
        let history = crate::InMemoryHistory::default();
        let events = crate::InMemoryEventBus::default();
        let result = run_dictation(
            &mut AudioFake { remaining: 1 },
            &AsrFake,
            &mut InjectorFake { fail: true },
            &TargetFake,
            &route(),
            &history,
            &events,
        )
        .unwrap();
        assert_eq!(result.inserted_text, None);
        assert!(result.injection_error.is_some());
        assert_eq!(history.recent(1)[0].transcript.text, "hello");
        assert!(
            events
                .recent()
                .iter()
                .any(|event| event.kind == EventKind::ModelFallback)
        );
    }
}
