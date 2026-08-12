import { fixtureBenchmarks, fixtureDiagnostics, fixtureExtensions, fixtureModels, fixtureOnboarding, fixturePrivacy, fixtureStatus, fixtureTranscripts, fixtureVocabulary, uglyTranscript } from './fixtures.js';
import type { DataMode, DataState, ListOptions, RepositoryError, SoriRepositories } from './repositories.js';
import type { AppStatus, BenchmarkResult, DiagnosticCheck, ExtensionRecord, ModelRecord, OnboardingState, PrivacySettings, Transcript, VocabularyTerm } from '../types.js';

const errorFor = (mode: DataMode): RepositoryError => ({ code: mode === 'error' ? 'offline' : 'server', message: mode === 'error' ? 'Mock backend is unavailable. Connect sorid or retry.' : 'Mock failure fixture requested.', retryable: true });
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => { const id = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')); }, { once: true }); });
async function state<T>(value: T, options: ListOptions = {}): Promise<DataState<T>> { const mode = options.mode ?? 'normal'; if (mode === 'loading') await wait(options.delayMs ?? 500, options.signal); else if (options.delayMs) await wait(options.delayMs, options.signal); if (mode === 'error') return { status: 'error', data: null, error: errorFor(mode), source: 'mock' }; const data = mode === 'empty' ? (Array.isArray(value) ? [] as T : value) : value; return { status: mode === 'empty' ? 'empty' : 'ready', data, error: null, source: 'mock' }; }
function filtered<T>(values: T[], options: ListOptions, key: (value: T) => string): T[] { const query = options.search?.trim().toLowerCase(); return query ? values.filter((value) => key(value).toLowerCase().includes(query)) : values; }
export function createMockRepositories(): SoriRepositories {
  let terms = [...fixtureVocabulary]; let extensions = [...fixtureExtensions];
  return {
    status: { get: (o) => state(fixtureStatus, o) },
    transcripts: { list: async (o = {}) => state(o.mode === 'ugly-data' ? [uglyTranscript] : filtered(fixtureTranscripts, o, (v) => `${v.appName} ${v.processedText ?? ''}`), o), get: async (id, o = {}) => state(fixtureTranscripts.find((v) => v.id === id) ?? fixtureTranscripts[0], o) },
    vocabulary: { list: async (o = {}) => state(filtered(terms, o, (v) => `${v.term} ${v.category}`), o), create: async (input) => { const created: VocabularyTerm = { ...input, id: `voc_${Date.now()}`, createdAt: new Date().toISOString() }; terms = [created, ...terms]; return state(created); }, remove: async (id) => { terms = terms.filter((v) => v.id !== id); return state({ id }); } },
    models: { list: (o) => state(fixtureModels, o), select: async (id) => state({ modelId: id }) },
    benchmarks: { list: (o) => state(fixtureBenchmarks, o) },
    extensions: { list: (o) => state(extensions, o), enable: async (id) => { const item = extensions.find((v) => v.id === id); if (!item) return { status: 'error', data: null, error: { code: 'not-found', message: 'Extension not found.', retryable: false }, source: 'mock' }; const next = { ...item, status: 'connected' as const }; extensions = extensions.map((v) => v.id === id ? next : v); return state(next); } },
    privacy: { get: (o) => state(fixturePrivacy, o) }, diagnostics: { run: (o) => state(fixtureDiagnostics, o) }, onboarding: { get: (o) => state(fixtureOnboarding, o) },
  };
}
