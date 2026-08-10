//! Core domain contracts for Sori's local-first programmable voice runtime.
//!
//! This crate intentionally contains no platform-specific capture, hotkey, or text
//! injection code. Platform adapters and concrete model providers implement these
//! traits in outer crates so the hot path can stay native-fast and testable.

pub mod audio;
pub mod benchmark;
pub mod context;
pub mod event;
pub mod history;
pub mod intent;
pub mod model;
pub mod permission;
pub mod pipeline;
pub mod routing;
pub mod transcript;

pub use audio::{AudioChunk, AudioEngine, AudioFormat, VoiceActivity};
pub use benchmark::{
    AccuracyMetrics, BenchmarkResult, LatencyMetrics, MemoryMetrics, ReliabilityMetrics,
    StartupMetrics,
};
pub use context::{ContextSnapshot, PrivacyMode, ProfileMode};
pub use event::{Event, EventBus, EventKind, InMemoryEventBus};
pub use history::{HistoryEntry, HistoryPolicy, HistoryRepository, InMemoryHistory};
pub use intent::{FastIntent, IntentRouter};
pub use model::{ModelId, ModelProvider, ModelRoute, ModelRuntime, RuntimeStatus};
pub use permission::{ActionRisk, PermissionDecision, PermissionRequest};
pub use pipeline::{PipelinePlan, PipelineStage};
pub use routing::{
    RouteExplanation, RoutePolicy, RoutePreset, RouteSimulatorInput, RouteTarget, explain_route,
};
pub use transcript::{Transcript, TranscriptSegment};
