import type { DataState, ListOptions, RepositoryError, SoriRepositories } from './repositories.js';
import type { AppStatus, BenchmarkResult, DiagnosticCheck, ExtensionRecord, ModelRecord, OnboardingState, PrivacySettings, Transcript, VocabularyTerm } from '../types.js';

type JsonFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
const unavailable = (message: string): RepositoryError => ({ code: 'offline', message, retryable: true });
async function request<T>(fetchImpl: JsonFetch, url: string, options: ListOptions = {}): Promise<DataState<T>> {
  try {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: options.signal });
    if (!response.ok) return { status: 'error', data: null, error: unavailable(`API request failed (${response.status})`), source: 'api' };
    const data = await response.json() as T;
    return { status: Array.isArray(data) && data.length === 0 ? 'empty' : 'ready', data, error: null, source: 'api' };
  } catch (error) { return { status: 'error', data: null, error: unavailable(error instanceof Error ? error.message : 'API request failed'), source: 'api' }; }
}
function unsupported<T>(name: string): Promise<DataState<T>> { return Promise.resolve({ status: 'error', data: null, error: { code: 'unsupported', message: `${name} is not wired to the backend API.`, retryable: false }, source: 'unavailable' }); }
export function createApiRepositories(fetchImpl: JsonFetch = fetch): SoriRepositories {
  const get = <T>(path: string, o?: ListOptions) => request<T>(fetchImpl, `/api/${path}`, o);
  return {
    status: { get: (o) => get<AppStatus>('status', o) },
    transcripts: { list: (o) => get<Transcript[]>('transcripts', o), get: (id, o) => get<Transcript>(`transcripts/${encodeURIComponent(id)}`, o) },
    vocabulary: { list: (o) => get<VocabularyTerm[]>('vocabulary', o), create: () => unsupported<VocabularyTerm>('Creating vocabulary'), remove: () => unsupported<{ id: string }>('Deleting vocabulary') },
    models: { list: (o) => get<ModelRecord[]>('models', o), select: () => unsupported<{ modelId: string }>('Selecting a model') },
    benchmarks: { list: (o) => get<BenchmarkResult[]>('benchmarks', o) },
    extensions: { list: (o) => get<ExtensionRecord[]>('extensions', o), enable: () => unsupported<ExtensionRecord>('Enabling an extension') },
    privacy: { get: (o) => get<PrivacySettings>('privacy', o) }, diagnostics: { run: (o) => get<DiagnosticCheck[]>('diagnostics', o) }, onboarding: { get: (o) => get<OnboardingState>('onboarding', o) },
  };
}
