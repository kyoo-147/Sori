import type { IpcTransport } from '../runtime-client.js';
import { requestShape } from '../ipc-contract.js';
import type { DataState, ListOptions, SoriRepositories } from './repositories.js';
import type { AppStatus, BenchmarkResult, DiagnosticCheck, ExtensionRecord, ModelRecord, OnboardingState, PrivacySettings, Transcript, VocabularyTerm } from '../types.js';

/** IPC adapter seam. It only maps responses supplied by sorid; it never invents success. */
export function createIpcRepositories(transport: IpcTransport): SoriRepositories {
  const query = async <T>(operation: 'status' | 'doctor', options: ListOptions = {}): Promise<DataState<T>> => {
    try {
      if (options.mode === 'loading' && options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      const response = await transport.request(operation);
      const payload = response && typeof response === 'object' ? response : null;
      if (!payload) return { status: 'error', data: null, error: { code: 'server', message: 'sorid returned an invalid response.', retryable: true }, source: 'ipc' };
      return { status: 'ready', data: payload as T, error: null, source: 'ipc' };
    } catch (error) { return { status: 'error', data: null, error: { code: 'offline', message: error instanceof Error ? error.message : 'sorid IPC unavailable.', retryable: true }, source: 'ipc' }; }
  };
  const unavailable = <T>(name: string): Promise<DataState<T>> => Promise.resolve({ status: 'error', data: null, error: { code: 'unsupported', message: `${name} is not exposed by the current sorid IPC contract.`, retryable: false }, source: 'unavailable' });
  return {
    status: { get: (o) => query<AppStatus>('status', o) },
    diagnostics: { run: (o) => query<DiagnosticCheck[]>('doctor', o) },
    transcripts: { list: () => unavailable<Transcript[]>('Transcript listing'), get: () => unavailable<Transcript>('Transcript detail') },
    vocabulary: { list: () => unavailable<VocabularyTerm[]>('Vocabulary listing'), create: () => unavailable<VocabularyTerm>('Vocabulary creation'), remove: () => unavailable<{ id: string }>('Vocabulary deletion') },
    models: { list: () => unavailable<ModelRecord[]>('Model listing'), select: () => unavailable<{ modelId: string }>('Model selection') },
    benchmarks: { list: () => unavailable<BenchmarkResult[]>('Benchmark listing') },
    extensions: { list: () => unavailable<ExtensionRecord[]>('Extension listing'), enable: () => unavailable<ExtensionRecord>('Extension enablement') },
    privacy: { get: () => unavailable<PrivacySettings>('Privacy settings') }, onboarding: { get: () => unavailable<OnboardingState>('Onboarding state') },
  };
}

export { requestShape };
