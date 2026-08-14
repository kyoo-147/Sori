/** Backend-shaped view-model types. Rust IPC remains authoritative for runtime/capability fields. */
export type CapabilityState = 'available' | 'unavailable' | 'unknown' | 'unsupported';
export type AppReadiness = 'ready' | 'listening' | 'processing' | 'inserting' | 'error' | 'unavailable';
export type TranscriptStatus = 'processed' | 'partial' | 'failed' | 'processing';
export interface AppStatus { ready: boolean; readiness: AppReadiness; hotkey: string; focusedTarget: string | null; activeRoute: { type: 'local' | 'cloud'; modelId: string }; capabilities: Record<string, CapabilityState>; }
export interface Transcript { id: string; appId: string; appName: string; createdAt: string; durationMs: number; latencyMs: number | null; status: TranscriptStatus; processedText: string | null; rawText: string | null; modelId: string | null; route: 'local' | 'cloud' | null; audio: { retained: boolean; url: string | null }; }
export interface VocabularyTerm { id: string; term: string; pronunciationHint: string | null; category: string; language: string; createdAt: string; }
export interface ModelRecord { id: string; name: string; provider: string; location: 'local' | 'cloud'; qualityTier: 'low' | 'standard' | 'high' | 'ultra'; recommended: boolean; available: boolean; unavailableReason: string | null; }
export interface BenchmarkResult { runId?: string | null; startedAt?: string | null; completedAt?: string | null; modelId: string; provider?: string | null; modelName: string; samples?: number | null; attempts?: number | null; coldStartMs: number | null; warmLatencyMs: number | null; p50Ms?: number | null; p95Ms?: number | null; ramMb: number | null; vramMb?: number | null; werPercent: number | null; cerPercent?: number | null; rtf: number | null; failureRate?: number | null; fallbackRate?: number | null; insertionMs?: number | null; passed?: boolean; isRecommended?: boolean; }
export interface BenchmarkRecommendation { runId: string; modelId: string; provider: string; }
export interface ExtensionRecord { id: string; name: string; description: string; status: 'available' | 'connected' | 'disabled' | 'permission-required' | 'error'; permissions: string[]; }
export interface PrivacySettings { saveTranscriptHistory: boolean; retentionDays: number | null; ephemeralAudio: boolean; voiceLock: CapabilityState; commandPolicy: 'ask-confirmation' | 'allow' | 'deny'; }
export interface DiagnosticCheck { id: string; name: string; state: 'not-checked' | 'checking' | 'passed' | 'warning' | 'failed' | 'unavailable'; detail: string; capability: CapabilityState; }
export interface OnboardingState { step: 'welcome' | 'microphone' | 'permissions' | 'hotkey' | 'ready'; completed: boolean; microphone: CapabilityState; permissions: CapabilityState; hotkey: CapabilityState; }
export type OverlayStyle = 'dot' | 'pill' | 'wave' | 'orb' | 'monochrome';

export type UserLevel = 'basic' | 'advanced' | 'expert';

export type ActiveScreen =
  | 'home'
  | 'transcripts'
  | 'vocabulary'
  | 'voice-edit'
  | 'models'
  | 'benchmarks'
  | 'extensions'
  | 'privacy'
  | 'diagnostics'
  | 'onboarding'
  | 'settings'
  | 'system-design'
  | 'playground'
  | 'dictionary'
  | 'snippets'
  | 'studio'
  | 'benchmark'
  | 'voice-id'
  | 'assistant-voice'
  | 'harness'
  | 'coverage';

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  languages: string[];
  diskSize: string;
  ramUsage: string;
  vramUsage: string;
  backend: 'whisper.cpp' | 'sherpa-onnx' | 'ONNX' | 'Cloud API' | 'Plugin';
  isInstalled: boolean;
  isWarm: boolean;
  recommendedFor: string;
  quantization?: string;
  speedRating: 'Ultra Fast' | 'Fast' | 'Balanced' | 'Accurate';
  latencyMs: number;
}

export interface RouteRule {
  id: string;
  condition: string;
  targetModel: string;
  enabled: boolean;
  priority: number;
}

export interface DictionaryTerm {
  id: string;
  term: string;
  pronunciation?: string;
  category: 'code' | 'name' | 'acronym' | 'vietnamese' | 'custom';
  casing?: 'normal' | 'snake_case' | 'camelCase' | 'PascalCase' | 'kebab-case';
  notes?: string;
  correction?: string;
}

export interface Snippet {
  id: string;
  triggerPhrase: string;
  expansion: string;
  category: 'code' | 'email' | 'signature' | 'command';
  scope: 'global' | 'vscode' | 'terminal';
  requiresApproval: boolean;
}

export interface ExtensionItem {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  status: 'active' | 'needs_approval' | 'disabled';
  installedAt: string;
  sampleCommand?: string;
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  rawTranscript: string;
  processedText: string;
  activeApp: string;
  mode: 'dictation' | 'edit' | 'command';
  latencyMs: number;
  modelUsed: string;
}


export interface VoiceProfile {
  enrolled: boolean;
  confidenceScore: number;
  guestPolicy: 'off' | 'soft_verify' | 'strict_owner_only' | 'guest_dictation_only';
  enrolledDate?: string;
  sampleCount: number;
}

export interface AssistantVoiceSettings {
  voiceId: string;
  provider: 'local' | 'cloud' | 'byok';
  speed: number;
  pitch: number;
  tone: 'calm' | 'friendly' | 'direct' | 'technical';
  replyPolicy: 'never' | 'conversation_only' | 'short_confirmations' | 'full_answers';
}

export interface AppSettings {
  overlayStyle: OverlayStyle;
  theme: 'dark-obsidian' | 'clean-light' | 'codex-emerald';
  activeProfile: 'Coding' | 'Writing' | 'Vietnamese' | 'General';
  hotkey: string;
  holdToSpeak: boolean;
  autoPunctuation: boolean;
  removeFillers: boolean;
  casingShortcut: boolean;
  soundFeedback: boolean;
  telemetryEnabled: boolean;
  retainAudio: boolean;
  retentionDays: number;
  permissionPolicy: 'ask_always' | 'dry_run_first' | 'auto_allow_trusted';
  userLevel: UserLevel;
}
