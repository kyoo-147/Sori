//! Non-blocking daemon lifecycle state machine.

use sori_core::{
    AudioChunk, EventBus, EventKind, ModelError, ModelId, ModelProvider, Transcript,
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
}

impl<B: EventBus> DaemonRuntime<B> {
    pub fn new(events: B) -> Self {
        let runtime = Self {
            state: RuntimeState::Ready,
            events,
            provider: None,
        };
        runtime.publish(EventKind::DaemonReady, Value::Null);
        runtime
    }

    pub fn new_with_provider(events: B, provider: Arc<dyn ModelProvider>) -> Self {
        let runtime = Self {
            state: RuntimeState::Ready,
            events,
            provider: Some(provider),
        };
        runtime.publish(EventKind::DaemonReady, Value::Null);
        runtime
    }

    /// Transcribe captured chunks through the configured provider boundary.
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
    use sori_core::{EventKind, InMemoryEventBus};
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
