use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EventKind {
    AudioStarted,
    VadSpeechStarted,
    AsrSelected,
    TranscriptPartial,
    TranscriptFinal,
    IntentDetected,
    ActionBefore,
    ActionAfter,
    PermissionRequested,
    ModelFallback,
    ExtensionInvoked,
    TtsStarted,
    TtsFinished,
    SpeakerVerified,
    SpeakerRejected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    pub id: Uuid,
    pub at: OffsetDateTime,
    pub kind: EventKind,
    pub payload: serde_json_like::Value,
}

pub trait EventBus: Send + Sync {
    fn publish(&self, event: Event);
    fn recent(&self) -> Vec<Event>;
}

#[derive(Debug, Default, Clone)]
pub struct InMemoryEventBus {
    events: Arc<Mutex<Vec<Event>>>,
}

impl InMemoryEventBus {
    pub fn publish_kind(&self, kind: EventKind) {
        self.publish(Event {
            id: Uuid::new_v4(),
            at: OffsetDateTime::now_utc(),
            kind,
            payload: serde_json_like::Value::Null,
        });
    }
}

impl EventBus for InMemoryEventBus {
    fn publish(&self, event: Event) {
        self.events
            .lock()
            .expect("event bus lock poisoned")
            .push(event);
    }

    fn recent(&self) -> Vec<Event> {
        self.events.lock().expect("event bus lock poisoned").clone()
    }
}

/// A tiny JSON-like payload type keeps the core crate free to evolve without
/// committing event schemas too early. Concrete adapters can map this to
/// serde_json at the boundary.
pub mod serde_json_like {
    use serde::{Deserialize, Serialize};
    use std::collections::BTreeMap;

    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    pub enum Value {
        Null,
        Bool(bool),
        Number(i64),
        String(String),
        Array(Vec<Value>),
        Object(BTreeMap<String, Value>),
    }
}
