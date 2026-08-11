import { requestShape, responsePayload, type DoctorCheck, type IpcOperation, type IpcRequest, type IpcResponseMap } from './ipc-contract.js';

export type { DoctorCheck, IpcOperation, IpcRequest } from './ipc-contract.js';

export interface DaemonStatus {
  daemon: 'starting' | 'running' | 'stopping' | 'unavailable';
  activity: 'idle' | 'listening' | 'processing' | 'waiting_approval' | 'error';
  paused: boolean;
  profile: string;
  privacy: string;
  version: string | null;
}

export type RuntimeSource = 'native' | 'backend' | 'mock' | 'unavailable';
export interface RuntimeResult<T> { data: T; source: RuntimeSource; error: string | null }
export interface IpcTransport {
  request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown>;
  readonly source?: Exclude<RuntimeSource, 'mock' | 'unavailable'>;
}

const unavailable: DaemonStatus = { daemon: 'unavailable', activity: 'error', paused: false, profile: 'Basic', privacy: 'LocalOnly', version: null };
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const endpoint = viteEnv?.VITE_SORI_IPC_URL || 'http://127.0.0.1:17373/ipc';

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function text(value: unknown, fallback: string | null = null): string | null { return typeof value === 'string' ? value : fallback; }
function unwrap(value: unknown, tag: string): Record<string, unknown> {
  const root = record(value);
  const pascal = tag.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
  const tagged = record(responsePayload(value, pascal as keyof IpcResponseMap) ?? root[tag]);
  return Object.keys(tagged).length ? tagged : root;
}
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export { requestShape } from './ipc-contract.js';

export function mapStatus(value: unknown): DaemonStatus {
  const raw = unwrap(value, 'status');
  return {
    daemon: raw.daemon === 'starting' || raw.daemon === 'stopping' || raw.daemon === 'running' ? raw.daemon : raw.running === true ? 'running' : 'unavailable',
    activity: raw.activity === 'listening' || raw.activity === 'processing' || raw.activity === 'waiting_approval' || raw.activity === 'idle' ? raw.activity : 'error',
    paused: raw.paused === true,
    profile: text(raw.profile, 'Basic')!,
    privacy: text(raw.privacy, 'LocalOnly')!,
    version: text(raw.daemon_version) ?? text(raw.version),
  };
}

export function mapDoctor(value: unknown): DoctorCheck[] {
  const raw = unwrap(value, 'doctor');
  const checks = Array.isArray(raw.checks) ? raw.checks : [];
  return checks.filter((check): check is DoctorCheck => {
    const item = record(check);
    return typeof item.name === 'string' && typeof item.ok === 'boolean' && typeof item.detail === 'string';
  });
}

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
const tauriInvoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
};

/** Native boundary, injectable so browser tests never need a Tauri runtime. */
export class NativeIpcTransport implements IpcTransport {
  readonly source = 'native' as const;
  constructor(
    private readonly invokeImpl: TauriInvoke = tauriInvoke,
    private readonly available: () => boolean = () => Boolean((globalThis as TauriWindow).__TAURI_INTERNALS__),
  ) {}
  async request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.available()) throw new Error('Tauri runtime is unavailable');
    return this.invokeImpl('sori_ipc', { request: requestShape(operation, params) });
  }
}

/** Prefer Tauri in the desktop shell, then retain the browser HTTP path. */
export class DesktopIpcTransport implements IpcTransport {
  private activeSource: Exclude<RuntimeSource, 'mock' | 'unavailable'> = 'native';
  constructor(
    private readonly native: IpcTransport = new NativeIpcTransport(),
    private readonly http: IpcTransport = new HttpIpcTransport(),
  ) {}
  get source() { return this.activeSource; }
  async request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown> {
    try {
      const value = await this.native.request(operation, params);
      this.activeSource = 'native';
      return value;
    } catch (nativeError) {
      try {
        const value = await this.http.request(operation, params);
        this.activeSource = 'backend';
        return value;
      } catch (httpError) {
        throw new Error(`Native IPC: ${errorText(nativeError)}; HTTP IPC: ${errorText(httpError)}`);
      }
    }
  }
}

export class MockRuntimeClient {
  private paused = false;
  async status(): Promise<RuntimeResult<DaemonStatus>> { return { data: { ...unavailable, daemon: 'running', activity: 'idle', paused: this.paused, profile: 'Coding', version: 'mock' }, source: 'mock', error: null }; }
  async doctor(): Promise<RuntimeResult<DoctorCheck[]>> {
    return {
      data: [
        { name: 'daemon', ok: true, detail: 'mock runtime preview' },
        { name: 'ipc-bind', ok: false, detail: 'real sorid IPC unavailable' },
      ],
      source: 'mock',
      error: null,
    };
  }
  async pause(): Promise<RuntimeResult<DaemonStatus>> { this.paused = true; return this.status(); }
  async resume(): Promise<RuntimeResult<DaemonStatus>> { this.paused = false; return this.status(); }
}

/** Real backend first; the preview client is used only when loopback IPC is absent. */
export class RuntimeClient {
  private readonly mock = new MockRuntimeClient();
  private usingMock = false;
  constructor(private readonly transport: IpcTransport = new DesktopIpcTransport()) {}
  async status(): Promise<RuntimeResult<DaemonStatus>> { return this.call('status', mapStatus, unavailable); }
  async doctor(): Promise<RuntimeResult<DoctorCheck[]>> {
    if (this.usingMock) return this.mock.doctor();
    return this.call('doctor', mapDoctor, []);
  }
  async pause(): Promise<RuntimeResult<DaemonStatus>> { return this.control('pause'); }
  async resume(): Promise<RuntimeResult<DaemonStatus>> { return this.control('resume'); }
  private async control(operation: 'pause' | 'resume'): Promise<RuntimeResult<DaemonStatus>> {
    if (this.usingMock) return operation === 'pause' ? this.mock.pause() : this.mock.resume();
    try {
      await this.transport.request(operation);
      return this.status();
    } catch (error) {
      return { data: unavailable, source: 'unavailable', error: errorText(error) };
    }
  }
  private async call<T>(operation: IpcOperation, mapper: (value: unknown) => T, fallback: T): Promise<RuntimeResult<T>> {
    try { return { data: mapper(await this.transport.request(operation)), source: this.transport.source ?? 'backend', error: null }; }
    catch (error) {
      if (operation === 'status') { this.usingMock = true; const mock = await this.mock.status(); return { ...mock, error: errorText(error) } as RuntimeResult<T>; }
      return { data: fallback, source: 'unavailable', error: errorText(error) };
    }
  }
}
