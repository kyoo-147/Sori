import type {
  AppStatus,
  BenchmarkResult,
  DiagnosticCheck,
  ExtensionRecord,
  ModelRecord,
  OnboardingState,
  PrivacySettings,
  Transcript,
  VocabularyTerm,
} from '../types.js';

export type DataMode = 'normal' | 'loading' | 'empty' | 'error' | 'ugly-data';

export type DataState<T> =
  | { status: 'loading'; data: null; error: null; source: DataSource }
  | { status: 'ready'; data: T; error: null; source: DataSource }
  | { status: 'empty'; data: T; error: null; source: DataSource }
  | { status: 'error'; data: null; error: RepositoryError; source: DataSource };

export type DataSource = 'mock' | 'api' | 'ipc' | 'unavailable';

export interface RepositoryError {
  code: 'validation' | 'permission' | 'not-found' | 'conflict' | 'server' | 'timeout' | 'offline' | 'unsupported';
  message: string;
  retryable: boolean;
}

export interface RepositoryOptions { mode?: DataMode; delayMs?: number; signal?: AbortSignal }
export interface ListOptions extends RepositoryOptions { search?: string; page?: number; pageSize?: number }

export interface AppStatusRepository { get(options?: RepositoryOptions): Promise<DataState<AppStatus>> }
export interface TranscriptRepository {
  list(options?: ListOptions): Promise<DataState<Transcript[]>>;
  get(id: string, options?: RepositoryOptions): Promise<DataState<Transcript>>;
}
export interface VocabularyRepository {
  list(options?: ListOptions): Promise<DataState<VocabularyTerm[]>>;
  create(input: Omit<VocabularyTerm, 'id' | 'createdAt'>): Promise<DataState<VocabularyTerm>>;
  remove(id: string): Promise<DataState<{ id: string }>>;
}
export interface ModelRepository {
  list(options?: ListOptions): Promise<DataState<ModelRecord[]>>;
  select(id: string): Promise<DataState<{ activeModelId: string | null }>>;
}
export interface BenchmarkRepository { list(options?: ListOptions): Promise<DataState<BenchmarkResult[]>> }
export interface ExtensionRepository { list(options?: ListOptions): Promise<DataState<ExtensionRecord[]>>; enable(id: string): Promise<DataState<ExtensionRecord>> }
export interface PrivacyRepository { get(options?: RepositoryOptions): Promise<DataState<PrivacySettings>> }
export interface DiagnosticsRepository { run(options?: RepositoryOptions): Promise<DataState<DiagnosticCheck[]>> }
export interface OnboardingRepository { get(options?: RepositoryOptions): Promise<DataState<OnboardingState>> }

export interface SoriRepositories {
  status: AppStatusRepository;
  transcripts: TranscriptRepository;
  vocabulary: VocabularyRepository;
  models: ModelRepository;
  benchmarks: BenchmarkRepository;
  extensions: ExtensionRepository;
  privacy: PrivacyRepository;
  diagnostics: DiagnosticsRepository;
  onboarding: OnboardingRepository;
}

export const repositoryError = (code: RepositoryError['code'], message: string, retryable = false): RepositoryError => ({ code, message, retryable });

export function isTerminalState<T>(state: DataState<T>): state is Extract<DataState<T>, { status: 'ready' | 'empty' }> {
  return state.status === 'ready' || state.status === 'empty';
}
