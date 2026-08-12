import {
  requestShape,
  responsePayload,
  type ConfigSummaryResponse,
  type DoctorCheck,
  type IpcEvent,
  type IpcOperation,
  type IpcResponseMap,
  type RouteSummary,
} from './ipc-contract.js';

export type { DoctorCheck, IpcEvent, IpcOperation, IpcRequest } from './ipc-contract.js';

export interface DaemonStatus {
  daemon: 'starting' | 'running' | 'stopping' | 'unavailable';
  activity: 'idle' | 'paused' | 'listening' | 'processing' | 'waiting_approval' | 'error';
  paused: boolean;
  hotkey: string;
  route: RouteSummary;
  profile: string;
  privacy: string;
  version: string | null;
}

// `mock` remains a display-only compatibility value for older shell components; RuntimeClient never returns it.
export type RuntimeSource = 'native' | 'backend' | 'mock' | 'unavailable';
export interface RuntimeResult<T> { data: T | null; source: RuntimeSource; error: string | null }
export interface IpcTransport {
  request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown>;
  readonly source?: Exclude<RuntimeSource, 'unavailable'>;
}

const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const endpoint = viteEnv?.VITE_SORI_IPC_URL || 'http://127.0.0.1:17373/ipc';
const fallbackRoute: RouteSummary = { prefer_local: true, allow_cloud: false, prefer_warm_runtime: false, optimize_battery: false };

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function text(value: unknown, fallback: string | null = null): string | null { return typeof value === 'string' ? value : fallback; }
function unwrap(value: unknown, tag: string): Record<string, unknown> {
  const root = record(value);
  const pascal = tag.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
  const tagged = record(responsePayload(value, pascal as keyof IpcResponseMap) ?? root[tag]);
  return Object.keys(tagged).length ? tagged : root;
}
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export const unavailableStatus: DaemonStatus = {
  daemon: 'unavailable', activity: 'error', paused: false, hotkey: 'Unavailable', route: fallbackRoute,
  profile: 'Unavailable', privacy: 'Unavailable', version: null,
};

export function mapStatus(value: unknown): DaemonStatus {
  const raw = unwrap(value, 'status');
  const route = record(raw.route);
  return {
    daemon: raw.running === true ? 'running' : raw.activity === 'Stopping' ? 'stopping' : 'unavailable',
    activity: raw.paused === true || raw.activity === 'Paused' ? 'paused' : raw.activity === 'Idle' ? 'idle' : 'error',
    paused: raw.paused === true,
    hotkey: text(raw.hotkey, 'Unavailable')!,
    route: { prefer_local: route.prefer_local === true, allow_cloud: route.allow_cloud === true, prefer_warm_runtime: route.prefer_warm_runtime === true, optimize_battery: route.optimize_battery === true },
    profile: text(raw.profile, 'Unavailable')!, privacy: text(raw.privacy, 'Unavailable')!,
    version: text(raw.daemon_version) ?? text(raw.version),
  };
}

export function mapDoctor(value: unknown): DoctorCheck[] {
  const checks = unwrap(value, 'doctor').checks;
  return Array.isArray(checks) ? checks.filter((check): check is DoctorCheck => {
    const item = record(check); return typeof item.name === 'string' && typeof item.ok === 'boolean' && typeof item.detail === 'string';
  }) : [];
}

export function mapConfigSummary(value: unknown): ConfigSummaryResponse {
  return unwrap(value, 'config_summary') as unknown as ConfigSummaryResponse;
}
export function eventText(event: IpcEvent): string | null {
  const payload = record(event.payload);
  return typeof payload.String === 'string' ? payload.String : null;
}

export function mapRecentEvents(value: unknown): IpcEvent[] {
  const events = unwrap(value, 'recent_events').events;
  return Array.isArray(events) ? events.filter((event): event is IpcEvent => {
    const item = record(event); return typeof item.id === 'string' && typeof item.at === 'string' && typeof item.kind === 'string';
  }) : [];
}

export { requestShape } from './ipc-contract.js';

export class HttpIpcTransport implements IpcTransport {
  readonly source = 'backend' as const;
  constructor(private readonly url = endpoint, private readonly fetchImpl: typeof fetch = fetch) {}
  async request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetchImpl(this.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(requestShape(operation, params)) });
    if (!response.ok) throw new Error(`IPC request failed (${response.status})`);
    return response.json();
  }
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type TauriWindow = { __TAURI_INTERNALS__?: unknown };
const tauriInvoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => { const { invoke } = await import('@tauri-apps/api/core'); return invoke<T>(command, args); };

export class NativeIpcTransport implements IpcTransport {
  readonly source = 'native' as const;
  constructor(private readonly invokeImpl: TauriInvoke = tauriInvoke, private readonly available: () => boolean = () => Boolean((globalThis as TauriWindow).__TAURI_INTERNALS__)) {}
  async request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.available()) throw new Error('Tauri runtime is unavailable');
    return this.invokeImpl('sori_ipc', { request: requestShape(operation, params) });
  }
}

export class DesktopIpcTransport implements IpcTransport {
  private activeSource: Exclude<RuntimeSource, 'unavailable'> = 'native';
  constructor(private readonly native: IpcTransport = new NativeIpcTransport(), private readonly http: IpcTransport = new HttpIpcTransport()) {}
  get source() { return this.activeSource; }
  async request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown> {
    try { const value = await this.native.request(operation, params); this.activeSource = 'native'; return value; }
    catch (nativeError) { try { const value = await this.http.request(operation, params); this.activeSource = 'backend'; return value; } catch (httpError) { throw new Error(`Native IPC: ${errorText(nativeError)}; HTTP IPC: ${errorText(httpError)}`); } }
  }
}

export class RuntimeClient {
  constructor(private readonly transport: IpcTransport = new DesktopIpcTransport()) {}
  status() { return this.call('status', mapStatus); }
  doctor() { return this.call('doctor', mapDoctor); }
  configSummary() { return this.call('config_summary', mapConfigSummary); }
  recentEvents(limit = 50) { return this.call('recent_events', mapRecentEvents, { limit }); }
  pause() { return this.control('pause'); }
  resume() { return this.control('resume'); }
  private async control(operation: 'pause' | 'resume'): Promise<RuntimeResult<DaemonStatus>> {
    try { await this.transport.request(operation); return this.status(); }
    catch (error) { return { data: null, source: 'unavailable', error: errorText(error) }; }
  }
  private async call<T>(operation: IpcOperation, mapper: (value: unknown) => T, params?: Record<string, unknown>): Promise<RuntimeResult<T>> {
    try { return { data: mapper(await this.transport.request(operation, params)), source: this.transport.source ?? 'backend', error: null }; }
    catch (error) { return { data: null, source: 'unavailable', error: errorText(error) }; }
  }
}
