import { requestShape, responsePayload, type IpcOperation, type IpcRequest, type IpcResponseMap } from './ipc-contract.js';

export type { IpcOperation, IpcRequest } from './ipc-contract.js';

export interface DaemonStatus {
  daemon: 'starting' | 'running' | 'stopping' | 'unavailable';
  activity: 'idle' | 'listening' | 'processing' | 'waiting_approval' | 'error';
  paused: boolean;
  profile: string;
  privacy: string;
  version: string | null;
}

export type RuntimeSource = 'backend' | 'mock' | 'unavailable';
export interface RuntimeResult<T> { data: T; source: RuntimeSource; error: string | null }
export interface IpcTransport { request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown> }

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

export class HttpIpcTransport implements IpcTransport {
  constructor(private readonly url = endpoint, private readonly fetchImpl: typeof fetch = fetch) {}
  async request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetchImpl(this.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(requestShape(operation, params)) });
    if (!response.ok) throw new Error(`IPC request failed (${response.status})`);
    return response.json();
  }
}

export class MockRuntimeClient {
  private paused = false;
  async status(): Promise<RuntimeResult<DaemonStatus>> { return { data: { ...unavailable, daemon: 'running', activity: 'idle', paused: this.paused, profile: 'Coding', version: 'mock' }, source: 'mock', error: null }; }
  async pause(): Promise<RuntimeResult<DaemonStatus>> { this.paused = true; return this.status(); }
  async resume(): Promise<RuntimeResult<DaemonStatus>> { this.paused = false; return this.status(); }
}

/** Real backend first; the preview client is used only when loopback IPC is absent. */
export class RuntimeClient {
  private readonly mock = new MockRuntimeClient();
  private usingMock = false;
  constructor(private readonly transport: IpcTransport = new HttpIpcTransport()) {}
  async status(): Promise<RuntimeResult<DaemonStatus>> { return this.call('status', mapStatus, unavailable); }
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
    try { return { data: mapper(await this.transport.request(operation)), source: 'backend', error: null }; }
    catch (error) {
      if (operation === 'status') { this.usingMock = true; const mock = await this.mock.status(); return { ...mock, error: errorText(error) } as RuntimeResult<T>; }
      return { data: fallback, source: 'unavailable', error: errorText(error) };
    }
  }
}
