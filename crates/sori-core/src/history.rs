use crate::{FastIntent, ModelRoute, Transcript};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HistoryPolicy {
    Off,
    SessionOnly,
    Recent20,
    Days(u16),
    Manual,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: Uuid,
    pub at: OffsetDateTime,
    pub active_app: Option<String>,
    pub transcript: Transcript,
    pub intent: FastIntent,
    pub route: Option<ModelRoute>,
    pub inserted_text: Option<String>,
}

pub trait HistoryRepository: Send + Sync {
    fn push(&self, entry: HistoryEntry);
    /// Fallible persistence hook for runtime paths that must not report success
    /// when a durable history write failed. Existing repositories keep the
    /// infallible contract while durable stores override this method.
    fn try_push(&self, entry: HistoryEntry) -> Result<(), String> {
        self.push(entry);
        Ok(())
    }
    fn recent(&self, limit: usize) -> Vec<HistoryEntry>;
    fn purge(&self);
}

#[derive(Debug, Default, Clone)]
pub struct InMemoryHistory {
    entries: Arc<Mutex<Vec<HistoryEntry>>>,
}

impl HistoryRepository for InMemoryHistory {
    fn push(&self, entry: HistoryEntry) {
        self.entries
            .lock()
            .expect("history lock poisoned")
            .push(entry);
    }

    fn recent(&self, limit: usize) -> Vec<HistoryEntry> {
        let entries = self.entries.lock().expect("history lock poisoned");
        entries.iter().rev().take(limit).cloned().collect()
    }

    fn purge(&self) {
        self.entries.lock().expect("history lock poisoned").clear();
    }
}
