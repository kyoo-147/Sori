import type { IpcTransport } from '../runtime-client.js';
import { requestShape } from '../ipc-contract.js';
import type { DataState, ListOptions, SoriRepositories } from './repositories.js';
import type { AppStatus, BenchmarkResult, DiagnosticCheck, ExtensionRecord, ModelRecord, OnboardingState, PrivacySettings, Transcript, VocabularyTerm } from '../types.js';

/** IPC adapter seam. It only maps responses supplied by sorid; it never invents success. */
export function createIpcRepositories(transport: IpcTransport): SoriRepositories {
  const query = async <T>(operation: 'status' | 'doctor' | 'recent_history', options: ListOptions = {}): Promise<DataState<T>> => {
    try {
      if (options.mode === 'loading' && options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      const response = await transport.request(operation, operation === 'recent_history' ? { limit: options.pageSize ?? 20 } : undefined);
      const payload = response && typeof response === 'object' ? response : null;
      if (!payload) return { status: 'error', data: null, error: { code: 'server', message: 'sorid returned an invalid response.', retryable: true }, source: 'ipc' };
      if (operation === 'recent_history' && 'RecentHistory' in payload) {
        const entries = (payload as { RecentHistory: { entries: unknown[] } }).RecentHistory.entries as T;
        return { status: Array.isArray(entries) && entries.length === 0 ? 'empty' : 'ready', data: entries, error: null, source: 'ipc' };
      }
      return { status: 'ready', data: payload as T, error: null, source: 'ipc' };
    } catch (error) {
      return { status: 'error', data: null, error: { code: 'offline', message: error instanceof Error ? error.message : 'sorid IPC unavailable.', retryable: true }, source: 'ipc' };
    }
  };
  const resource = async <T>(name: string): Promise<DataState<T>> => {
    try {
      const response = await transport.request('resource_get', { resource: name });
      const payload = response && typeof response === 'object' && 'Resource' in response ? (response as { Resource?: { resource?: unknown; value?: unknown } }).Resource : undefined;
      if (!payload || payload.resource !== name) return { status: 'error', data: null, error: { code: 'server', message: `sorid returned an invalid ${name} resource.`, retryable: true }, source: 'ipc' };
      return { status: Array.isArray(payload.value) && payload.value.length === 0 ? 'empty' : 'ready', data: payload.value as T, error: null, source: 'ipc' };
    } catch (error) {
      return { status: 'error', data: null, error: { code: 'offline', message: error instanceof Error ? error.message : `sorid resource ${name} unavailable.`, retryable: true }, source: 'ipc' };
    }
  };
  const saveResource = async <T>(name: string, value: T): Promise<DataState<T>> => {
    try {
      const response = await transport.request('resource_set', { resource: name, value });
      const payload = response && typeof response === 'object' && 'Resource' in response ? (response as { Resource?: { resource?: unknown; value?: unknown } }).Resource : undefined;
      if (!payload || payload.resource !== name) return { status: 'error', data: null, error: { code: 'server', message: `sorid rejected the ${name} resource.`, retryable: true }, source: 'ipc' };
      return { status: 'ready', data: payload.value as T, error: null, source: 'ipc' };
    } catch (error) {
      return { status: 'error', data: null, error: { code: 'offline', message: error instanceof Error ? error.message : `sorid resource ${name} unavailable.`, retryable: true }, source: 'ipc' };
    }
  };
  const unavailable = <T>(name: string): Promise<DataState<T>> => Promise.resolve({ status: 'error', data: null, error: { code: 'unsupported', message: `${name} is not exposed by the current sorid IPC contract.`, retryable: false }, source: 'unavailable' });
  const repositories: any = {
    status: { get: (o: ListOptions | undefined) => query<AppStatus>('status', o) },
    diagnostics: { run: (o: ListOptions | undefined) => query<DiagnosticCheck[]>('doctor', o) },
    transcripts: { list: (o: ListOptions | undefined) => query<Transcript[]>('recent_history', o), get: async (id: string, o: ListOptions | undefined) => { const result = await query<Transcript[]>('recent_history', o); const item = result.status === 'ready' || result.status === 'empty' ? result.data.find((entry) => entry.id === id) : undefined; return item ? { status: 'ready', data: item, error: null, source: 'ipc' } : unavailable<Transcript>('Transcript detail'); } },
    vocabulary: { list: () => resource<VocabularyTerm[]>('vocabulary'), create: async (input: Omit<VocabularyTerm, 'id' | 'createdAt'>) => { const current = await resource<VocabularyTerm[]>('vocabulary'); if (current.status === 'error') return current; const created = { ...input, id: `voc_${crypto.randomUUID()}`, createdAt: new Date().toISOString() }; return saveResource('vocabulary', [created, ...(current.data ?? [])]); }, remove: async (id: string) => { const current = await resource<VocabularyTerm[]>('vocabulary'); if (current.status === 'error') return current as unknown as DataState<{ id: string }>; const saved = await saveResource('vocabulary', (current.data ?? []).filter((term) => term.id !== id)); return saved.status === 'error' ? saved as unknown as DataState<{ id: string }> : { status: 'ready', data: { id }, error: null, source: 'ipc' }; } },
    models: { list: () => resource<ModelRecord[]>('models'), select: async (id: string) => { const saved = await saveResource('route', { activeModelId: id }); return saved.status === 'error' ? saved as unknown as DataState<{ activeModelId: string | null }> : { status: 'ready', data: saved.data, error: null, source: 'ipc' }; } },
    benchmarks: { list: () => resource<BenchmarkResult[]>('benchmarks') },
    extensions: { list: () => resource<ExtensionRecord[]>('extensions'), enable: async (id: string) => { const current = await resource<ExtensionRecord[]>('extensions'); if (current.status === 'error') return current as unknown as DataState<ExtensionRecord>; const item = (current.data ?? []).find((extension) => extension.id === id); if (!item) return { status: 'error', data: null, error: { code: 'not-found', message: `Extension ${id} was not found.`, retryable: false }, source: 'ipc' }; const updated = { ...item, status: 'connected' as const }; const saved = await saveResource('extensions', (current.data ?? []).map((extension) => extension.id === id ? updated : extension)); return saved.status === 'error' ? saved as unknown as DataState<ExtensionRecord> : { status: 'ready', data: updated, error: null, source: 'ipc' }; } },
    privacy: { get: () => resource<PrivacySettings>('privacy') },
    onboarding: { get: () => resource<OnboardingState>('onboarding') },
  };
  return repositories as SoriRepositories;
}

export { requestShape };
