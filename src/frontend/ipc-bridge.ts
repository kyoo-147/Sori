import type { DaemonStatus, TrayResponse } from '../tray/protocol.js';

/** View models deliberately contain no transport-specific enums or serde shapes. */
export interface DaemonStatusView {
  daemon: 'starting' | 'running' | 'stopping' | 'unavailable';
  activity: 'idle' | 'listening' | 'processing' | 'waiting_approval' | 'error';
  paused: boolean;
  profile: string;
  privacy: string;
  version: string | null;
}

export interface DoctorCheckView { name: string; ok: boolean; detail: string; }
export interface DoctorView { checks: DoctorCheckView[]; ok: boolean; }
export interface RouteModelSummaryView {
  profile: string;
  privacy: string;
  historyEnabled: boolean;
  route: string | null;
  model: string | null;
}
export interface TranscriptView {
  id: string;
  at: string;
  text: string;
  model: string | null;
  status: 'partial' | 'final' | 'event';
}

export type IpcOperation = 'status' | 'doctor' | 'config_summary' | 'recent_events' | 'pause' | 'resume';
export interface IpcTransport { request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown>; }
export interface RuntimeResult<T> { data: T; source: 'backend' | 'tray' | 'mock'; error: string | null; }

const unavailableStatus: DaemonStatusView = {
  daemon: 'unavailable', activity: 'error', paused: false, profile: 'Basic', privacy: 'LocalOnly', version: null
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function string(value: unknown, fallback: string | null = null): string | null {
  return typeof value === 'string' ? value : fallback;
}
function unwrap(value: unknown, tag: string): Record<string, unknown> {
  const root = object(value);
  const pascal = tag.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
  const tagged = object(root[tag] ?? root[pascal]);
  return Object.keys(tagged).length > 0 ? tagged : root;
}
function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function mapDaemonStatus(value: unknown): DaemonStatusView {
  const raw = object(value);
  const status = raw.protocol_version !== undefined ? raw : unwrap(value, 'status');
  const tray = status as Partial<DaemonStatus>;
  return {
    daemon: tray.daemon ?? (status.running === true ? 'running' : 'unavailable'),
    activity: tray.activity ?? (status.running === true ? 'idle' : 'error'),
    paused: tray.paused === true,
    profile: string(status.profile, 'Basic')!,
    privacy: string(status.privacy, 'LocalOnly')!,
    version: string(status.daemon_version)
  };
}

export function mapDoctor(value: unknown): DoctorView {
  const raw = unwrap(value, 'doctor');
  const checks = Array.isArray(raw.checks) ? raw.checks.map((check) => {
    const item = object(check);
    return { name: string(item.name, 'unknown')!, ok: item.ok === true, detail: string(item.detail, '')! };
  }) : [];
  return { checks, ok: checks.length > 0 && checks.every((check) => check.ok) };
}

export function mapRouteModelSummary(value: unknown): RouteModelSummaryView {
  const raw = unwrap(value, 'config_summary');
  const route = object(raw.route);
  const model = object(raw.model);
  return {
    profile: string(raw.profile, 'Basic')!,
    privacy: string(raw.privacy, 'LocalOnly')!,
    historyEnabled: raw.history_enabled === true || raw.historyEnabled === true,
    route: string(raw.route) ?? string(route.name) ?? string(route.id),
    model: string(raw.model) ?? string(model.name) ?? string(model.id)
  };
}

export function mapRecentTranscripts(value: unknown): TranscriptView[] {
  const raw = unwrap(value, 'recent_events');
  const events = Array.isArray(raw.events) ? raw.events : [];
  return events.flatMap((event): TranscriptView[] => {
    const item = object(event); const payload = object(item.payload);
    const kind = String(item.kind ?? '').toLowerCase();
    const text = string(payload.text) ?? string(payload.transcript) ?? string(payload.raw_transcript) ?? (typeof item.text === 'string' ? item.text : null);
    if (!text) return [];
    return [{ id: string(item.id, crypto.randomUUID())!, at: string(item.at, new Date().toISOString())!, text, model: string(payload.model) ?? string(payload.model_used), status: kind.includes('partial') ? 'partial' : kind.includes('final') ? 'final' : 'event' }];
  });
}

/** Stable frontend boundary. Calls never throw, so a disconnected daemon is a UI state. */
export class RuntimeClient {
  public constructor(protected readonly transport: IpcTransport, private readonly source: RuntimeResult<unknown>['source'] = 'backend') {}

  public async status(): Promise<RuntimeResult<DaemonStatusView>> { return this.call('status', mapDaemonStatus, unavailableStatus); }
  public async doctor(): Promise<RuntimeResult<DoctorView>> { return this.call('doctor', mapDoctor, { checks: [], ok: false }); }
  public async routeModelSummary(): Promise<RuntimeResult<RouteModelSummaryView>> { return this.call('config_summary', mapRouteModelSummary, { profile: 'Basic', privacy: 'LocalOnly', historyEnabled: false, route: null, model: null }); }
  public async pause(): Promise<RuntimeResult<DaemonStatusView>> { return this.call('pause', mapDaemonStatus, unavailableStatus); }
  public async resume(): Promise<RuntimeResult<DaemonStatusView>> { return this.call('resume', mapDaemonStatus, unavailableStatus); }
  public async recentTranscripts(limit = 10): Promise<RuntimeResult<TranscriptView[]>> { return this.call('recent_events', mapRecentTranscripts, [] as TranscriptView[], { limit }); }

  private async call<T>(operation: IpcOperation, mapper: (value: unknown) => T, fallback: T, params?: Record<string, unknown>): Promise<RuntimeResult<T>> {
    try { return { data: mapper(await this.transport.request(operation, params)), source: this.source, error: null }; }
    catch (error) { return { data: fallback, source: 'mock', error: failure(error) }; }
  }
}

/** Preview client; its data is intentionally backend-shaped to exercise mapping. */
export class MockRuntimeClient extends RuntimeClient {
  public constructor() {
    const state = { paused: false };
    super({ request: async (operation) => {
      if (operation === 'pause' || operation === 'resume') state.paused = operation === 'pause';
      if (operation === 'status' || operation === 'pause' || operation === 'resume') return { Status: { protocol_version: 1, daemon_version: 'mock', running: true, profile: 'Coding', privacy: 'LocalOnly', daemon: 'running', activity: 'idle', paused: state.paused } };
      if (operation === 'doctor') return { Doctor: { checks: [{ name: 'daemon', ok: true, detail: 'mock daemon is reachable' }] } };
      if (operation === 'config_summary') return { ConfigSummary: { profile: 'Coding', privacy: 'LocalOnly', history_enabled: true, route: 'local-first', model: 'parakeet-v2' } };
      return { RecentEvents: { events: [] } };
    } }, 'mock');
  }
}

/** Tauri v2 adapter kept as a boundary so the browser build has no Tauri dependency. */
export class TauriCommandTransport implements IpcTransport {
  public constructor(private readonly invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>, private readonly command = 'sori_ipc') {}
  public request(operation: IpcOperation, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.invoke(this.command, { operation, ...params });
  }
}

export function trayTransport(transport: { send(request: unknown): Promise<TrayResponse<unknown>> }): IpcTransport {
  return { request: async (operation) => {
    if (operation !== 'status' && operation !== 'pause' && operation !== 'resume') throw new Error('tray transport does not implement this operation');
    const response = await transport.send({ id: `ui_${Date.now()}`, version: 1, method: operation, params: {} } as never);
    if (!response.ok) throw new Error(response.error.message);
    return response.result;
  } };
}
