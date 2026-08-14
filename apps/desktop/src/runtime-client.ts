import { requestShape, responsePayload, type ConfigSummaryResponse, type ControlResponse, type DoctorCheck, type ExtensionManifest, type ExtensionRecord, type HistoryEntry, type IpcOperation, type IpcResponseMap, type ModelsResponse, type RouteSummary, type TranscriptResponse, type VoiceEditResponse, type VoiceEditSelection } from './ipc-contract.js';
import type { ModelRecord } from './types';
export type { DoctorCheck, IpcOperation, IpcRequest } from './ipc-contract.js';
export interface DaemonStatus { daemon: 'starting' | 'running' | 'stopping' | 'unavailable'; activity: 'idle' | 'paused' | 'error'; paused: boolean; hotkey: string; route: RouteSummary; profile: string; privacy: string; version: string | null; }
export type RuntimeSource = 'native' | 'backend' | 'mock' | 'unavailable';
export interface RuntimeResult<T> { data: T; source: RuntimeSource; error: string | null; }
export interface IpcTransport { request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown>; readonly source?: Exclude<RuntimeSource, 'unavailable'>; isAvailable?: () => boolean; }
const unavailable: DaemonStatus = { daemon: 'unavailable', activity: 'error', paused: false, hotkey: 'Alt+Space', route: { prefer_local: true, allow_cloud: false, prefer_warm_runtime: false, optimize_battery: false }, profile: 'Basic', privacy: 'LocalOnly', version: null };
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const endpoint = viteEnv?.VITE_SORI_IPC_URL || 'http://127.0.0.1:17373/ipc';
let nextRequestId = 1;
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function text(value: unknown, fallback: string | null = null): string | null { return typeof value === 'string' ? value : fallback; }
function unwrap(value: unknown, tag: string): Record<string, unknown> { const root = record(value); const pascal = tag.split('_').map((p) => p[0].toUpperCase() + p.slice(1)).join(''); const tagged = record(responsePayload(value, pascal as keyof IpcResponseMap) ?? root[tag]); return Object.keys(tagged).length ? tagged : root; }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export { requestShape } from './ipc-contract.js';
export function mapStatus(value: unknown): DaemonStatus { const raw = unwrap(value, 'status'); return { daemon: raw.daemon === 'starting' || raw.daemon === 'stopping' || raw.daemon === 'running' ? raw.daemon : raw.running === true ? 'running' : 'unavailable', activity: raw.paused === true || raw.activity === 'Paused' ? 'paused' : raw.activity === 'Idle' ? 'idle' : 'error', paused: raw.paused === true || raw.activity === 'Paused', hotkey: text(raw.hotkey, 'Alt+Space')!, route: { prefer_local: record(raw.route).prefer_local === true, allow_cloud: record(raw.route).allow_cloud === true, prefer_warm_runtime: record(raw.route).prefer_warm_runtime === true, optimize_battery: record(raw.route).optimize_battery === true }, profile: text(raw.profile, 'Basic')!, privacy: text(raw.privacy, 'LocalOnly')!, version: text(raw.daemon_version) ?? text(raw.version) }; }
export function mapDoctor(value: unknown): DoctorCheck[] { const checks = unwrap(value, 'doctor').checks; return Array.isArray(checks) ? checks.filter((check): check is DoctorCheck => { const item = record(check); return typeof item.name === 'string' && typeof item.ok === 'boolean' && typeof item.detail === 'string'; }) : []; }
export function mapHistory(value: unknown): HistoryEntry[] { const entries = unwrap(value, 'recent_history').entries; return Array.isArray(entries) ? entries.filter((entry): entry is HistoryEntry => { const item = record(entry); return typeof item.id === 'string' && typeof item.at === 'string' && typeof record(item.transcript).text === 'string'; }) : []; }
export function mapModels(value: unknown): ModelRecord[] {
  const payload = responsePayload(value, 'Models') as ModelsResponse | undefined;
  if (!payload?.available) throw new Error(payload?.error ?? 'model registry is unavailable');
  if (!Array.isArray(payload.models)) throw new Error('daemon returned an invalid model registry');
  return payload.models.map(({ manifest, status }) => {
    const provider = payload.provider ?? status.backend ?? manifest.backend;
    const id = provider ? `${provider}/${manifest.id}` : manifest.id;
    return { id, name: manifest.display_name, provider, location: 'local', qualityTier: 'standard', recommended: false, available: status.installed, unavailableReason: status.installed ? null : 'Model files are not installed by the daemon' };
  });
}
export class HttpIpcTransport implements IpcTransport { readonly source = 'backend' as const; constructor(private readonly url = endpoint, private readonly fetchImpl: typeof fetch = fetch) {} async request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown> { const response = await this.fetchImpl(this.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(requestShape(operation, params)) }); if (!response.ok) throw new Error(`IPC request failed (${response.status})`); return response.json(); } }
type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>; type TauriWindow = { __TAURI_INTERNALS__?: unknown };
const tauriInvoke: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => { const { invoke } = await import('@tauri-apps/api/core'); return invoke<T>(command, args); };
export class NativeIpcTransport implements IpcTransport { readonly source = 'native' as const; constructor(private readonly invokeImpl: TauriInvoke = tauriInvoke, private readonly available: () => boolean = () => Boolean((globalThis as TauriWindow).__TAURI_INTERNALS__)) {} isAvailable() { return this.available(); } async request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown> { if (!this.available()) throw new Error('Tauri runtime is unavailable'); const request_id = `ui-${nextRequestId++}`; return this.invokeImpl('sori_ipc', { request: requestShape(operation, params), request_id }); } async cancel(request_id: string): Promise<boolean> { if (!this.available()) return false; return this.invokeImpl<boolean>('sori_ipc_cancel', { request_id }); } }
export class DesktopIpcTransport implements IpcTransport { private activeSource: Exclude<RuntimeSource, 'unavailable'> = 'native'; constructor(private readonly native: IpcTransport = new NativeIpcTransport(), private readonly http: IpcTransport = new HttpIpcTransport()) {} get source() { return this.activeSource; } async request(operation: IpcOperation, params?: Record<string, unknown>): Promise<unknown> { if (this.native.isAvailable?.() === false) { const value = await this.http.request(operation, params); this.activeSource = 'backend'; return value; } const value = await this.native.request(operation, params); this.activeSource = 'native'; return value; } }
export class RuntimeClient {
  constructor(private readonly transport: IpcTransport = new DesktopIpcTransport()) {}
  status() { return this.call('status', mapStatus, unavailable); }
  doctor() { return this.call('doctor', mapDoctor, []); }
  modelReadiness() { return this.doctor().then((result) => ({ ...result, data: result.data.find((check) => check.name === 'whisper') ?? { name: 'whisper', ok: false, detail: 'UNVERIFIED: model readiness was not reported by sorid' } })); }
  configSummary() { return this.call('config_summary', (v) => unwrap(v, 'config_summary') as unknown as ConfigSummaryResponse, null); }
  history(limit = 20) { return this.call('recent_history', mapHistory, [], { limit }); }
  async purgeHistory() { return this.control('purge_history'); }
  async deleteHistory(id: string) { return this.control('delete_history', { id }); }
  async setConfig(key: string, value: unknown) { return this.control('set_config', { key, value }); }
  async dictationStart() { return this.control('dictation_start'); }
  async dictationStop() { return this.call('dictation_stop', (v) => unwrap(v, 'transcript') as unknown as TranscriptResponse, null); }
  async dictationCancel() { return this.control('dictation_cancel'); }
  async voiceEdit(selection: VoiceEditSelection, instruction: string, approved = false) { return this.call('voice_edit', (value) => (responsePayload(value, 'VoiceEdit') ?? null) as VoiceEditResponse | null, null, { selection, instruction, approved }); }
  async runBenchmark(model: string, audio: unknown[], reference: string | null, iterations = 5) { return this.call('run_benchmark', (v) => responsePayload(v, 'Benchmark') ?? null, null, { model, audio, reference, iterations }); }
  async recentBenchmarks(limit = 20) { return this.call('recent_benchmarks', (v) => (responsePayload(v, 'Resource') as { value: unknown[] } | undefined)?.value ?? [], [], { limit }); }
  async applyBenchmarkRecommendation(model: string) { return this.call('apply_benchmark_recommendation', (value) => (responsePayload(value, 'Resource') as { value: unknown } | undefined)?.value ?? null, null, { model }); }
  resource<T>(name: string) { return this.call('resource_get', (value) => (responsePayload(value, 'Resource') as { value: T }).value, null as T, { resource: name }); }
  models() { return this.call('models', mapModels, [] as ModelRecord[]); }
  installModel(model: string, source: string, expectedSha256: string) { return this.call('model_install', (value) => responsePayload(value, 'ModelStatus') ?? null, null, { model, source, expected_sha256: expectedSha256 }); }
  removeModel(model: string) { return this.call('model_remove', (value) => responsePayload(value, 'ModelStatus') ?? null, null, { model }); }
  route<T = unknown>() { return this.resource<T>('route'); }
  setActiveModel(modelId: string) { return this.setResource<{ activeModelId: string | null }>('route', { activeModelId: modelId }); }
  setRoutePolicy(policy: 'Performance' | 'Balanced' | 'Battery' | 'Privacy' | 'LocalFirst' | 'CloudAllowed' | 'NeverCloud') { return this.setConfig('route.policy', policy); }
  async setResource<T>(name: string, value: T) { return this.call('resource_set', (response) => (responsePayload(response, 'Resource') as { value: T }).value, value, { resource: name, value }); }
  async pause() { const result = await this.control('pause'); return result.error ? { data: unavailable, source: 'unavailable' as const, error: result.error } : this.status(); }
  async resume() { const result = await this.control('resume'); return result.error ? { data: unavailable, source: 'unavailable' as const, error: result.error } : this.status(); }
  extensions() { return this.call('extensions_list', (v) => (responsePayload(v, 'Extensions') as { extensions: ExtensionRecord[] }).extensions, []); }
  extensionEnable(id: string) { return this.control('extension_enable', { id }); }
  extensionDisable(id: string) { return this.control('extension_disable', { id }); }
  extensionUninstall(id: string) { return this.control('extension_uninstall', { id }); }
  extensionInstall(manifest: ExtensionManifest) { return this.control('extension_install', { manifest }); }
  private async control(operation: IpcOperation, params?: Record<string, unknown>): Promise<RuntimeResult<ControlResponse>> { try { const value = await this.transport.request(operation, params); const ipcError = responsePayload(value, 'Error'); if (ipcError) throw new Error(`${ipcError.code}: ${ipcError.detail}`); return { data: (responsePayload(value, 'Control') ?? { accepted: false, detail: 'IPC returned no control response' }) as ControlResponse, source: this.transport.source ?? 'backend', error: null }; } catch (error) { return { data: { accepted: false, detail: errorText(error) }, source: 'unavailable', error: errorText(error) }; } }
  private async call<T>(operation: IpcOperation, mapper: (value: unknown) => T, fallback: T, params?: Record<string, unknown>): Promise<RuntimeResult<T>> { try { const value = await this.transport.request(operation, params); const ipcError = responsePayload(value, 'Error'); if (ipcError) throw new Error(`${ipcError.code}: ${ipcError.detail}`); return { data: mapper(value), source: this.transport.source ?? 'backend', error: null }; } catch (error) { return { data: fallback, source: 'unavailable', error: errorText(error) }; } }
}
