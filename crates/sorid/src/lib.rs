//! The `sorid` daemon runtime and its integration boundaries.

pub mod config;
pub mod runtime;

pub use config::{DaemonConfig, HotkeyConfig};
pub use runtime::{DaemonRuntime, RuntimeState, RuntimeTransitionError};
