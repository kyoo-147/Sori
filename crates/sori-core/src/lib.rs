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
pub mod hotkey;
pub mod intent;
pub mod model;
pub mod permission;
pub mod pipeline;
pub mod routing;
pub mod text_injection;
pub mod transcript;

pub use audio::{
    AudioCaptureEngine, AudioChunk, AudioDeviceInfo, AudioDeviceProvider, AudioEngine, AudioError,
    AudioFormat, CaptureConfig, DspPipelineConfig, EnergyVadStub, SampleFormat, VoiceActivity,
    VoiceActivityDetector,
};
pub use benchmark::{
    AccuracyMetrics, BenchmarkResult, LatencyMetrics, MemoryMetrics, ReliabilityMetrics,
    StartupMetrics,
};
pub use context::{ContextSnapshot, PrivacyMode, ProfileMode};
pub use event::{Event, EventBus, EventKind, InMemoryEventBus};
pub use history::{HistoryEntry, HistoryPolicy, HistoryRepository, InMemoryHistory};
pub use hotkey::{
    FakeHotkeyBackend, FakeHotkeyRegistration, HotkeyBackend, HotkeyCombination, HotkeyError,
    HotkeyEvent, HotkeyInput, HotkeyRegistration, HotkeyState, HotkeyStateMachine,
    UnsupportedHotkeyBackend,
};
#[cfg(windows)]
pub use hotkey::{WindowsHotkeyBackend, WindowsHotkeyRegistration};
pub use intent::{FastIntent, IntentRouter};
pub use model::{
    ExternalProcessProvider, ExternalProcessSpec, ModelError, ModelId, ModelLicense, ModelManifest,
    ModelProvider, ModelRoute, ModelRuntime, RuntimeStatus,
};
pub use permission::{ActionRisk, PermissionDecision, PermissionRequest};
pub use pipeline::{DictationResult, PipelineError, PipelinePlan, PipelineStage, run_dictation};
pub use routing::{
    RouteExplanation, RoutePolicy, RoutePreset, RouteSimulatorInput, RouteTarget, explain_route,
};
#[cfg(windows)]
pub use text_injection::windows::WindowsSendInputAdapter;
pub use text_injection::windows::WindowsTextInjector;
pub use text_injection::{
    AdapterTextInjector, ClipboardPolicy, InjectionPlan, InjectionStrategy, InjectorCapabilities,
    TextInjectionAdapter, TextInjectionError, TextInjectionRequest, TextInjectionResult,
    TextInjector, TextTarget, TextTargetCapabilities, UndoRestoreAttempt, UndoRestoreStatus,
    select_strategy,
};
pub use transcript::{Transcript, TranscriptSegment};
