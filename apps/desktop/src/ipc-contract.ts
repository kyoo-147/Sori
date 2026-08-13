/** TypeScript mirror of crates/sori-ipc/src/lib.rs. Keep Rust serde tagging authoritative. */
export type ProfileMode = 'Basic' | 'Coding' | 'Email' | 'Chat' | 'Terminal' | 'Custom';
export type PrivacyMode = 'Auto' | 'LocalOnly' | 'CloudAllowed' | 'NeverCloud';
export type RuntimeActivity = 'Idle' | 'Paused' | 'Error' | 'Stopping';
export interface RouteSummary { prefer_local: boolean; allow_cloud: boolean; prefer_warm_runtime: boolean; optimize_battery: boolean; }
export type EventKind = 'AudioStarted' | 'AudioChunkCaptured' | 'AudioStopped' | 'AudioError' | 'HotkeyPressed' | 'HotkeyReleased' | 'HotkeyCancelled' | 'VadSpeechStarted' | 'VadSpeechEnded' | 'AsrSelected' | 'TranscriptPartial' | 'TranscriptFinal' | 'IntentDetected' | 'ActionBefore' | 'ActionAfter' | 'PermissionRequested' | 'ModelFallback' | 'DictationCancelled' | 'ExtensionInvoked' | 'TtsStarted' | 'TtsFinished' | 'SpeakerVerified' | 'SpeakerRejected' | 'DaemonReady' | 'DaemonPaused' | 'DaemonError' | 'DaemonShuttingDown' | 'CapabilityAvailable' | 'CapabilityUnavailable';
export interface IpcEvent { id: string; at: string; kind: EventKind; payload: IpcValue; }
export type IpcValue = 'Null' | { Bool: boolean } | { Number: number } | { String: string } | { Array: IpcValue[] } | { Object: Record<string, IpcValue> };
export type IpcRequest =
  | 'Status' | 'Doctor' | 'ConfigSummary' | 'DictationStart' | 'DictationStop' | 'DictationCancel' | 'PurgeHistory' | 'Pause' | 'Resume'
  | { RecentEvents: { limit: number } }
  | { ResourceGet: { resource: string } }
  | { ResourceSet: { resource: string; value: unknown } }
  | { RecentHistory: { limit: number } }
  | { SetConfig: { key: string; value: unknown } }
  | { Dictation: { model: string; audio: AudioChunk[] } }
  | { VoiceEdit: { selection: VoiceEditSelection; instruction: string; approved: boolean } };
export interface StatusResponse { protocol_version: number; daemon_version: string; running: boolean; activity: RuntimeActivity; paused: boolean; hotkey: string; route: RouteSummary; profile: ProfileMode; privacy: PrivacyMode; }
export interface DoctorCheck { name: string; ok: boolean; detail: string; }
export interface DoctorResponse { status: StatusResponse; checks: DoctorCheck[]; }
export interface ConfigSummaryResponse { profile: ProfileMode; privacy: PrivacyMode; history_enabled: boolean; hotkey: string; route: RouteSummary; }
export interface RecentEventsResponse { events: IpcEvent[]; }
export interface ResourceResponse { resource: string; value: unknown; }
export interface HistoryEntry { id: string; at: string; active_app: string | null; transcript: TranscriptResponse; intent: unknown; route: unknown; inserted_text: string | null; }
export interface RecentHistoryResponse { entries: HistoryEntry[]; }
export interface ControlResponse { accepted: boolean; detail: string; }
export interface AudioChunk { captured_at: string; format: { sample_rate_hz: number; channels: number; sample_format: 'I16' | 'F32'; }; samples: number[]; }
export interface TranscriptResponse { language?: string | null; text: string; segments: unknown[]; }
export interface VoiceEditSelection { target_identity: string; text: string; }
export interface VoiceEditResponse { accepted: boolean; transformed_text: string | null; diff: string | null; detail: string; }
export interface IpcResponseMap { Status: StatusResponse; Doctor: DoctorResponse; ConfigSummary: ConfigSummaryResponse; RecentEvents: RecentEventsResponse; RecentHistory: RecentHistoryResponse; Resource: ResourceResponse; Control: ControlResponse; Transcript: TranscriptResponse; VoiceEdit: VoiceEditResponse; Error: { code: string; detail: string }; }
export type IpcResponse = { [K in keyof IpcResponseMap]: { [P in K]: IpcResponseMap[K] } }[keyof IpcResponseMap];
export type IpcOperation = 'status' | 'doctor' | 'config_summary' | 'recent_events' | 'recent_history' | 'resource_get' | 'resource_set' | 'purge_history' | 'set_config' | 'dictation_start' | 'dictation_stop' | 'dictation_cancel' | 'voice_edit' | 'pause' | 'resume';
export function requestShape(operation: IpcOperation, params: Record<string, unknown> = {}): IpcRequest {
  switch (operation) {
    case 'status': return 'Status'; case 'doctor': return 'Doctor'; case 'config_summary': return 'ConfigSummary';
    case 'dictation_start': return 'DictationStart'; case 'dictation_stop': return 'DictationStop'; case 'dictation_cancel': return 'DictationCancel';
    case 'voice_edit': return { VoiceEdit: { selection: params.selection, instruction: String(params.instruction ?? ''), approved: params.approved === true } } as unknown as IpcRequest;
    case 'purge_history': return 'PurgeHistory'; case 'pause': return 'Pause'; case 'resume': return 'Resume';
    case 'recent_events': return { RecentEvents: { limit: Number(params.limit ?? 20) } };
    case 'resource_get': return { ResourceGet: { resource: String(params.resource ?? '') } };
    case 'resource_set': return { ResourceSet: { resource: String(params.resource ?? ''), value: params.value } };
    case 'recent_history': return { RecentHistory: { limit: Number(params.limit ?? 20) } };
    case 'set_config': return { SetConfig: { key: String(params.key ?? ''), value: params.value } };
  }
}
export function responsePayload<K extends keyof IpcResponseMap>(value: unknown, variant: K): IpcResponseMap[K] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[variant] as IpcResponseMap[K] | undefined;
}
export function isIpcResponse(value: unknown): value is IpcResponse { return !!value && typeof value === 'object' && ['Status', 'Doctor', 'ConfigSummary', 'RecentEvents', 'RecentHistory', 'Resource', 'Control', 'Transcript', 'VoiceEdit', 'Error'].some((variant) => variant in (value as object)); }
