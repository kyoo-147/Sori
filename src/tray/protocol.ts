/** Versioned JSON contract shared by the tray and the future local IPC adapter. */
export const TRAY_PROTOCOL_VERSION = 1 as const;

export const TRAY_MENU_ITEMS = [
  'ready',
  'pause',
  'profile',
  'mic',
  'route',
  'settings',
  'diagnostics',
  'quit'
] as const;

export type TrayMenuItem = (typeof TRAY_MENU_ITEMS)[number];
export type TrayMethod =
  | 'status'
  | 'pause'
  | 'resume'
  | 'open_settings'
  | 'open_models'
  | 'open_benchmark';

export type DaemonState = 'starting' | 'running' | 'stopping' | 'unavailable';
export type ActivityState = 'idle' | 'listening' | 'processing' | 'waiting_approval' | 'error';

export interface DaemonStatus {
  daemon: DaemonState;
  activity: ActivityState;
  paused: boolean;
  profile: string;
  privacy: string;
  protocol_version: typeof TRAY_PROTOCOL_VERSION;
}

export interface TrayRequest {
  id: string;
  version: typeof TRAY_PROTOCOL_VERSION;
  method: TrayMethod;
  params: Record<string, never>;
}

export interface TraySuccess<T> {
  id: string;
  version: typeof TRAY_PROTOCOL_VERSION;
  ok: true;
  result: T;
}

export interface TrayFailure {
  id: string;
  version: typeof TRAY_PROTOCOL_VERSION;
  ok: false;
  error: { code: string; message: string };
}

export type TrayResponse<T> = TraySuccess<T> | TrayFailure;

export function createRequest(id: string, method: TrayMethod): TrayRequest {
  return { id, version: TRAY_PROTOCOL_VERSION, method, params: {} };
}

export function isStatus(value: unknown): value is DaemonStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<DaemonStatus>;
  return (
    (status.daemon === 'starting' || status.daemon === 'running' || status.daemon === 'stopping' || status.daemon === 'unavailable') &&
    (status.activity === 'idle' || status.activity === 'listening' || status.activity === 'processing' || status.activity === 'waiting_approval' || status.activity === 'error') &&
    typeof status.paused === 'boolean' &&
    typeof status.profile === 'string' &&
    typeof status.privacy === 'string' &&
    status.protocol_version === TRAY_PROTOCOL_VERSION
  );
}
