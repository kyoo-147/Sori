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
  | { Dictation: { model: string; audio: AudioChunk[] } }
  | { RecentEvents: { limit: number } };

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
export interface ControlResponse { accepted: boolean; detail: string; }
export interface AudioChunk { captured_at: string; format: { sample_rate_hz: number; channels: number; sample_format: 'I16' | 'F32' }; samples: number[]; }
export interface TranscriptResponse { language?: string | null; text: string; segments: unknown[]; }

export interface IpcResponseMap {
  Status: StatusResponse;
  Doctor: DoctorResponse;
  ConfigSummary: ConfigSummaryResponse;
  RecentEvents: RecentEventsResponse;
  Control: ControlResponse;
  Transcript: TranscriptResponse;
}
export type IpcResponse = { [K in keyof IpcResponseMap]: { [P in K]: IpcResponseMap[K] } }[keyof IpcResponseMap];

export type IpcOperation = 'status' | 'doctor' | 'config_summary' | 'recent_events' | 'pause' | 'resume';

export function requestShape(operation: IpcOperation, params: Record<string, unknown> = {}): IpcRequest {
  switch (operation) {
    case 'status': return 'Status';
    case 'doctor': return 'Doctor';
    case 'config_summary': return 'ConfigSummary';
    case 'recent_events': return { RecentEvents: { limit: Number(params.limit ?? 10) } };
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
  return !!value && typeof value === 'object' && ['Status', 'Doctor', 'ConfigSummary', 'RecentEvents', 'Control', 'Transcript']
    .some((variant) => variant in (value as object));
}
