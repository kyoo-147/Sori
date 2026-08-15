/** TypeScript mirror of crates/sori-ipc/src/lib.rs. Keep Rust serde tagging authoritative. */
export type ProfileMode = 'Basic' | 'Coding' | 'Email' | 'Chat' | 'Terminal' | 'Custom';
export type PrivacyMode = 'Auto' | 'LocalOnly' | 'CloudAllowed' | 'NeverCloud';
export type RuntimeActivity = 'Idle' | 'Paused' | 'Error' | 'Stopping';
export interface RouteSummary { prefer_local: boolean; allow_cloud: boolean; prefer_warm_runtime: boolean; optimize_battery: boolean; }
export type EventKind = 'AudioStarted' | 'AudioChunkCaptured' | 'AudioStopped' | 'AudioError' | 'HotkeyPressed' | 'HotkeyReleased' | 'HotkeyCancelled' | 'VadSpeechStarted' | 'VadSpeechEnded' | 'AsrSelected' | 'TranscriptPartial' | 'TranscriptFinal' | 'IntentDetected' | 'ActionBefore' | 'ActionAfter' | 'PermissionRequested' | 'ModelFallback' | 'DictationCancelled' | 'ExtensionInvoked' | 'TtsStarted' | 'TtsFinished' | 'SpeakerVerified' | 'SpeakerRejected' | 'DaemonReady' | 'DaemonPaused' | 'DaemonError' | 'DaemonShuttingDown' | 'CapabilityAvailable' | 'CapabilityUnavailable';
export interface IpcEvent { id: string; at: string; kind: EventKind; payload: IpcValue; }
export type IpcValue = 'Null' | { Bool: boolean } | { Number: number } | { String: string } | { Array: IpcValue[] } | { Object: Record<string, IpcValue> };
export interface AudioChunk { captured_at: string; format: { sample_rate_hz: number; channels: number; sample_format: 'I16' | 'F32'; }; samples: number[]; }
export interface VoiceEditSelection { target_identity: string; text: string; }
export interface VoiceEditResponse { accepted: boolean; transformed_text: string | null; diff: string | null; detail: string; }
export interface ExtensionManifest { id: string; name: string; version: string; description: string; entrypoint: string; permissions: string[]; license: string; license_url?: string | null; package_sha256?: string | null; }
export interface ExtensionRecord { manifest: ExtensionManifest; state: 'enabled' | 'disabled' | 'error'; installed_at: number; updated_at: number; last_error?: string | null; }
export type IpcRequest =
  | 'Status' | 'Doctor' | 'ConfigSummary' | 'Models' | 'DictationStart' | 'DictationStop' | 'DictationCancel' | 'PurgeHistory' | 'DeleteHistory' | 'Pause' | 'Resume' | 'ExtensionsList'
  | { RecentEvents: { limit: number } } | { ResourceGet: { resource: string } } | { ResourceSet: { resource: string; value: unknown } } | { ResourceDelete: { resource: string } } | { RecentHistory: { limit: number } } | { DeleteHistory: { id: string } } | { SetConfig: { key: string; value: unknown } } | { Dictation: { model: string; audio: AudioChunk[] } }
  | { VoiceEdit: { selection: VoiceEditSelection; instruction: string; approved: boolean } }
  | { ModelInstall: { model: string; source: string; expected_sha256: string } } | { ModelRemove: { model: string } } | { ModelStatus: { model: string } } | { ModelLoad: { model: string } } | { ModelWarm: { model: string } } | { ModelUnload: { model: string } }
  | { ExtensionInstall: { manifest: ExtensionManifest } } | { ExtensionEnable: { id: string } } | { ExtensionDisable: { id: string } } | { ExtensionUninstall: { id: string } } | { ExtensionInvoke: { id: string; command: string; input: unknown } }
  | { RunBenchmark: { model: string; audio: AudioChunk[]; reference: string | null; iterations: number; session_id?: string | null; timeout_ms?: number | null } } | { CancelBenchmark: { session_id: string } } | { RecentBenchmarks: { limit: number } } | { ApplyBenchmarkRecommendation: { model: string | null } };
export interface StatusResponse { protocol_version: number; daemon_version: string; running: boolean; activity: RuntimeActivity; paused: boolean; hotkey: string; route: RouteSummary; profile: ProfileMode; privacy: PrivacyMode; }
export interface DoctorCheck { name: string; ok: boolean; detail: string; }
export interface DoctorResponse { status: StatusResponse; checks: DoctorCheck[]; }
export interface ConfigSummaryResponse { profile: ProfileMode; privacy: PrivacyMode; history_enabled: boolean; history_retention_limit: number; hotkey: string; route: RouteSummary; }
export interface RecentEventsResponse { events: IpcEvent[]; }
export interface ResourceResponse { resource: string; value: unknown; }
export interface ModelManifest { id: string; display_name: string; language: string; backend: string; quantization: string | null; disk_size_bytes: number | null; ram_bytes: number | null; license: { name: string; url: string | null; attribution: string | null }; }
export interface ModelRuntimeStatus { model: string; installed: boolean; loaded: boolean; warm: boolean; memory_bytes: number | null; backend: string | null; }
export interface DaemonModelRecord { manifest: ModelManifest; status: ModelRuntimeStatus; }
export interface ModelsResponse { provider: string | null; available: boolean; models: DaemonModelRecord[]; error: string | null; }
export interface HistoryEntry { id: string; at: string; active_app: string | null; transcript: TranscriptResponse; intent: unknown; route: unknown; inserted_text: string | null; }
export interface RecentHistoryResponse { entries: HistoryEntry[]; }
export interface ControlResponse { accepted: boolean; detail: string; }
export interface TranscriptResponse { language?: string | null; text: string; segments: unknown[]; }
export interface IpcResponseMap { Status: StatusResponse; Doctor: DoctorResponse; ConfigSummary: ConfigSummaryResponse; Models: ModelsResponse; ModelStatus: { provider: string; status: ModelRuntimeStatus }; RecentEvents: RecentEventsResponse; RecentHistory: RecentHistoryResponse; Resource: ResourceResponse; Control: ControlResponse; Transcript: TranscriptResponse; VoiceEdit: VoiceEditResponse; Extensions: { extensions: ExtensionRecord[] }; Benchmark: unknown; Error: { code: string; detail: string }; }
export type IpcResponse = { [K in keyof IpcResponseMap]: { [P in K]: IpcResponseMap[K] } }[keyof IpcResponseMap];
export type IpcOperation = 'status' | 'doctor' | 'config_summary' | 'models' | 'model_status' | 'model_load' | 'model_warm' | 'model_unload' | 'model_install' | 'model_remove' | 'recent_events' | 'recent_history' | 'resource_get' | 'resource_set' | 'resource_delete' | 'purge_history' | 'set_config' | 'dictation_start' | 'dictation_stop' | 'dictation_cancel' | 'voice_edit' | 'pause' | 'resume' | 'extensions_list' | 'extension_install' | 'extension_enable' | 'extension_disable' | 'extension_uninstall' | 'extension_invoke' | 'run_benchmark' | 'cancel_benchmark' | 'recent_benchmarks' | 'apply_benchmark_recommendation' | 'delete_history';
export function requestShape(operation: IpcOperation, params: Record<string, unknown> = {}): IpcRequest {
  switch (operation) {
    case 'status': return 'Status'; case 'doctor': return 'Doctor'; case 'config_summary': return 'ConfigSummary'; case 'models': return 'Models';
    case 'model_install': return { ModelInstall: { model: String(params.model ?? ''), source: String(params.source ?? ''), expected_sha256: String(params.expected_sha256 ?? '') } }; case 'model_remove': return { ModelRemove: { model: String(params.model ?? '') } }; case 'model_status': return { ModelStatus: { model: String(params.model ?? '') } }; case 'model_load': return { ModelLoad: { model: String(params.model ?? '') } }; case 'model_warm': return { ModelWarm: { model: String(params.model ?? '') } }; case 'model_unload': return { ModelUnload: { model: String(params.model ?? '') } };
    case 'dictation_start': return 'DictationStart'; case 'dictation_stop': return 'DictationStop'; case 'dictation_cancel': return 'DictationCancel';
    case 'voice_edit': return { VoiceEdit: { selection: params.selection, instruction: String(params.instruction ?? ''), approved: params.approved === true } } as unknown as IpcRequest;
    case 'purge_history': return 'PurgeHistory'; case 'delete_history': return { DeleteHistory: { id: String(params.id ?? '') } }; case 'pause': return 'Pause'; case 'resume': return 'Resume'; case 'extensions_list': return 'ExtensionsList';
    case 'recent_events': return { RecentEvents: { limit: Number(params.limit ?? 20) } }; case 'resource_get': return { ResourceGet: { resource: String(params.resource ?? '') } };
    case 'resource_set': return { ResourceSet: { resource: String(params.resource ?? ''), value: params.value } }; case 'resource_delete': return { ResourceDelete: { resource: String(params.resource ?? '') } }; case 'recent_history': return { RecentHistory: { limit: Number(params.limit ?? 20) } };
    case 'run_benchmark': return { RunBenchmark: { model: String(params.model ?? ''), audio: (params.audio ?? []) as AudioChunk[], reference: typeof params.reference === 'string' ? params.reference : null, iterations: Number(params.iterations ?? 5), session_id: typeof params.session_id === 'string' ? params.session_id : null, timeout_ms: params.timeout_ms == null ? null : Number(params.timeout_ms) } };
    case 'cancel_benchmark': return { CancelBenchmark: { session_id: String(params.session_id ?? '') } };
    case 'recent_benchmarks': return { RecentBenchmarks: { limit: Number(params.limit ?? 20) } }; case 'apply_benchmark_recommendation': return { ApplyBenchmarkRecommendation: { model: typeof params.model === 'string' ? params.model : null } };
  }
  throw new Error(`unsupported IPC operation: ${operation}`);
}
export function responsePayload<K extends keyof IpcResponseMap>(value: unknown, variant: K): IpcResponseMap[K] | undefined { if (!value || typeof value !== 'object') return undefined; return (value as Record<string, unknown>)[variant] as IpcResponseMap[K] | undefined; }
export function isIpcResponse(value: unknown): value is IpcResponse { return !!value && typeof value === 'object' && ['Status', 'Doctor', 'ConfigSummary', 'Models', 'ModelStatus', 'RecentEvents', 'RecentHistory', 'Resource', 'Control', 'Transcript', 'VoiceEdit', 'Extensions', 'Benchmark', 'Error'].some((variant) => variant in (value as object)); }
