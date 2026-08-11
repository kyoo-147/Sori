//! The `sorid` daemon runtime and its integration boundaries.

pub mod config;
pub mod runtime;

pub use config::{DaemonConfig, HotkeyConfig};
pub use runtime::{DaemonRuntime, RuntimeState, RuntimeTransitionError};

use sori_core::{Event, EventBus};
use std::sync::Arc;

/// Shares a persistent event bus between the runtime and IPC handlers.
pub struct SharedEventBus<B>(pub Arc<B>);

impl<B: EventBus> EventBus for SharedEventBus<B> {
    fn publish(&self, event: Event) {
        self.0.publish(event);
    }

    fn recent(&self) -> Vec<Event> {
        self.0.recent()
    }
}
