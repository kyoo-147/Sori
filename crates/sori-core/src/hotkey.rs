//! Platform-neutral hold-to-talk hotkey contracts and state machine.
//!
//! OS adapters should translate native key notifications into [`HotkeyInput`]
//! values and feed them to [`HotkeyStateMachine`]. The state machine deliberately
//! ignores duplicate notifications, making it safe to use with key-repeat.

use crate::event::{Event, EventBus, EventKind, serde_json_like::Value};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HotkeyInput {
    Pressed,
    Released,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HotkeyState {
    Idle,
    Held,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HotkeyEvent {
    Pressed,
    Released,
    Cancelled,
}

impl HotkeyEvent {
    pub const fn kind(self) -> EventKind {
        match self {
            Self::Pressed => EventKind::HotkeyPressed,
            Self::Released => EventKind::HotkeyReleased,
            Self::Cancelled => EventKind::HotkeyCancelled,
        }
    }

    pub fn into_event(self) -> Event {
        Event {
            id: Uuid::new_v4(),
            at: OffsetDateTime::now_utc(),
            kind: self.kind(),
            payload: Value::Null,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct HotkeyStateMachine {
    state: HotkeyState,
}

impl Default for HotkeyStateMachine {
    fn default() -> Self {
        Self::new()
    }
}

impl HotkeyStateMachine {
    pub const fn new() -> Self {
        Self {
            state: HotkeyState::Idle,
        }
    }

    pub const fn state(self) -> HotkeyState {
        self.state
    }

    /// Applies an input and returns an event only when it changes the session.
    pub fn apply(&mut self, input: HotkeyInput) -> Option<HotkeyEvent> {
        match (self.state, input) {
            (HotkeyState::Idle, HotkeyInput::Pressed) => {
                self.state = HotkeyState::Held;
                Some(HotkeyEvent::Pressed)
            }
            (HotkeyState::Held, HotkeyInput::Released) => {
                self.state = HotkeyState::Idle;
                Some(HotkeyEvent::Released)
            }
            (HotkeyState::Held, HotkeyInput::Cancelled) => {
                self.state = HotkeyState::Idle;
                Some(HotkeyEvent::Cancelled)
            }
            // Ignore key-repeat and stale release/cancel notifications.
            _ => None,
        }
    }

    pub fn apply_and_publish<B: EventBus>(
        &mut self,
        input: HotkeyInput,
        events: &B,
    ) -> Option<HotkeyEvent> {
        let event = self.apply(input)?;
        events.publish(event.into_event());
        Some(event)
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum HotkeyError {
    #[error("hotkey backend is not available on this platform")]
    Unsupported,
    #[error("hotkey backend is already running")]
    AlreadyRunning,
    #[error("hotkey backend is not running")]
    NotRunning,
}

/// Boundary for native registration and notification loops.
///
/// A backend owns OS resources; event normalization remains in
/// [`HotkeyStateMachine`] so it can be tested without Windows.
pub trait HotkeyBackend {
    fn start(&mut self) -> Result<(), HotkeyError>;
    fn stop(&mut self) -> Result<(), HotkeyError>;
}

#[derive(Debug, Default)]
pub struct UnsupportedHotkeyBackend;

impl HotkeyBackend for UnsupportedHotkeyBackend {
    fn start(&mut self) -> Result<(), HotkeyError> {
        Err(HotkeyError::Unsupported)
    }

    fn stop(&mut self) -> Result<(), HotkeyError> {
        Err(HotkeyError::Unsupported)
    }
}

/// Windows registration placeholder. Native `RegisterHotKey` integration is
/// intentionally deferred until manual Windows message-loop testing.
#[cfg(windows)]
#[derive(Debug, Default)]
pub struct WindowsHotkeyBackend;

#[cfg(windows)]
impl HotkeyBackend for WindowsHotkeyBackend {
    fn start(&mut self) -> Result<(), HotkeyError> {
        Err(HotkeyError::Unsupported)
    }

    fn stop(&mut self) -> Result<(), HotkeyError> {
        Err(HotkeyError::Unsupported)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::InMemoryEventBus;

    #[test]
    fn hold_to_talk_transitions_once() {
        let mut state = HotkeyStateMachine::new();
        assert_eq!(
            state.apply(HotkeyInput::Pressed),
            Some(HotkeyEvent::Pressed)
        );
        assert_eq!(state.apply(HotkeyInput::Pressed), None);
        assert_eq!(
            state.apply(HotkeyInput::Released),
            Some(HotkeyEvent::Released)
        );
        assert_eq!(state.state(), HotkeyState::Idle);
    }

    #[test]
    fn cancellation_returns_to_idle_and_publishes() {
        let mut state = HotkeyStateMachine::new();
        let events = InMemoryEventBus::default();
        assert_eq!(
            state.apply_and_publish(HotkeyInput::Pressed, &events),
            Some(HotkeyEvent::Pressed)
        );
        assert_eq!(
            state.apply_and_publish(HotkeyInput::Cancelled, &events),
            Some(HotkeyEvent::Cancelled)
        );
        assert_eq!(state.apply(HotkeyInput::Released), None);
        assert_eq!(
            events
                .recent()
                .iter()
                .map(|event| event.kind.clone())
                .collect::<Vec<_>>(),
            vec![EventKind::HotkeyPressed, EventKind::HotkeyCancelled,]
        );
    }
}
