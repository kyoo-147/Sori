/**
 * TypeScript mirror of crates/sori-ipc/src/lib.rs.
 *
 * Rust's default serde representation is externally tagged: unit variants are
 * strings and struct variants are objects keyed by the variant name.
 */
export type ProfileMode = 'Basic' | 'Coding' | 'Email' | 'Chat' | 'Terminal' | 'Custom';
export type PrivacyMode = 'Auto' | 'LocalOnly' | 'CloudAllowed' | 'NeverCloud';
export type RuntimeActivity = 'Idle' | 'Paused' | 'Error' | 'Stopping';
export interface RouteSummary {
  prefer_local: boolean;
  allow_cloud: boolean;
  prefer_warm_runtime: boolean;
  optimize_battery: boolean;
}
export type EventKind =
  | 'AudioStarted' | 'HotkeyPressed' | 'HotkeyReleased' | 'HotkeyCancelled'
  | 'VadSpeechStarted' | 'AsrSelected' | 'TranscriptPartial' | 'TranscriptFinal'
  | 'IntentDetected' | 'ActionBefore' | 'ActionAfter' | 'PermissionRequested'
  | 'ModelFallback' | 'ExtensionInvoked' | 'TtsStarted' | 'TtsFinished'
  | 'SpeakerVerified' | 'SpeakerRejected' | 'DaemonReady' | 'DaemonPaused'
  | 'DaemonError' | 'DaemonShuttingDown';

export interface IpcEvent {
  id: string;
  at: string;
  kind: EventKind;
  payload: IpcValue;
}
/** serde_json_like::Value is also externally tagged (it is not JSON's native value union). */
export type IpcValue =
  | 'Null'
  | { Bool: boolean }
  | { Number: number }
  | { String: string }
  | { Array: IpcValue[] }
  | { Object: Record<string, IpcValue> };

export type IpcRequest =
  | 'Status' | 'Doctor' | 'ConfigSummary' | 'Pause' | 'Resume'
  | { RecentEvents: { limit: number } }
  | { RecentHistory: { limit: number } };

export interface StatusResponse {
  protocol_version: number;
  daemon_version: string;
  running: boolean;
  activity: RuntimeActivity;
  paused: boolean;
  hotkey: string;
  route: RouteSummary;
  profile: ProfileMode;
  privacy: PrivacyMode;
}
export interface DoctorCheck { name: string; ok: boolean; detail: string; }
export interface DoctorResponse { status: StatusResponse; checks: DoctorCheck[]; }
export interface ConfigSummaryResponse { profile: ProfileMode; privacy: PrivacyMode; history_enabled: boolean; hotkey: string; route: RouteSummary; }
export interface RecentEventsResponse { events: IpcEvent[]; }
export type FastIntent =
  | { Dictation: { text: string } }
  | { EditSelection: { instruction: string } }
  | { DeterministicCommand: { command: string } }
  | { Snippet: { trigger: string } }
  | { AgentRequest: { prompt: string } };
export interface TranscriptSegment { text: string; start: string; end: string; confidence: number | null; speaker: string | null; }
export interface Transcript { language: string | null; text: string; segments: TranscriptSegment[]; }
export interface IpcHistoryEntry {
  id: string; at: string; active_app: string | null; transcript: Transcript;
  intent: FastIntent; route: Record<string, unknown> | null; inserted_text: string | null;
}
export interface RecentHistoryResponse { entries: IpcHistoryEntry[]; }
export interface ControlResponse { accepted: boolean; detail: string; }

export interface IpcResponseMap {
  Status: StatusResponse;
  Doctor: DoctorResponse;
  ConfigSummary: ConfigSummaryResponse;
  RecentEvents: RecentEventsResponse;
  RecentHistory: RecentHistoryResponse;
  Control: ControlResponse;
}
export type IpcResponse = { [K in keyof IpcResponseMap]: { [P in K]: IpcResponseMap[K] } }[keyof IpcResponseMap];

export type IpcOperation = 'status' | 'doctor' | 'config_summary' | 'recent_events' | 'recent_history' | 'pause' | 'resume';

export function requestShape(operation: IpcOperation, params: Record<string, unknown> = {}): IpcRequest {
  switch (operation) {
    case 'status': return 'Status';
    case 'doctor': return 'Doctor';
    case 'config_summary': return 'ConfigSummary';
    case 'recent_events': return { RecentEvents: { limit: Number(params.limit ?? 10) } };
    case 'recent_history': return { RecentHistory: { limit: Number(params.limit ?? 10) } };
    case 'pause': return 'Pause';
    case 'resume': return 'Resume';
  }
}

/** Return the payload for a Rust externally-tagged response variant. */
export function responsePayload<K extends keyof IpcResponseMap>(value: unknown, variant: K): IpcResponseMap[K] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const payload = (value as Record<string, unknown>)[variant];
  return payload as IpcResponseMap[K] | undefined;
}

export function isIpcResponse(value: unknown): value is IpcResponse {
  return !!value && typeof value === 'object' && ['Status', 'Doctor', 'ConfigSummary', 'RecentEvents', 'RecentHistory', 'Control']
    .some((variant) => variant in (value as object));
}
