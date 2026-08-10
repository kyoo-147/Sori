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

export interface BenchmarkResult {
  modelId: string;
  modelName: string;
  coldStartMs: number;
  warmLatencyMs: number;
  ramMb: number;
  werPercent: number;
  rtf: number; // Real-time factor
  insertionMs: number;
  passed: boolean;
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
