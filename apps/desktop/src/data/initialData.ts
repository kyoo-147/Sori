import { AppSettings, ModelInfo, RouteRule, Snippet, VoiceProfile, AssistantVoiceSettings } from '../types';

/** Production models, routes, history, vocabulary, and benchmarks are daemon-owned. */
/** This disabled cloud entry is policy metadata only; it is never presented as installed or active. */
export const initialModels: ModelInfo[] = [{
  id: 'groq-whisper-cloud', name: 'Groq Whisper Large v3 (Cloud)', description: 'Optional BYOK/cloud fallback.', languages: ['99+ Languages'], diskSize: '0 MB (Cloud)', ramUsage: 'UNVERIFIED', vramUsage: '0 MB', backend: 'Cloud API', isInstalled: false, isWarm: false, recommendedFor: 'Optional BYOK/cloud fallback', quantization: undefined, speedRating: 'Balanced', latencyMs: 95,
}];
export const initialRoutes: RouteRule[] = [{ id: 'cloud-fallback-policy', condition: 'fallback_chain && byok_configured == true', targetModel: 'groq-whisper-cloud', enabled: false, priority: 4, }];
export const initialSnippets: Snippet[] = [];

export const defaultSettings: AppSettings = {
  overlayStyle: 'pill',
  theme: 'dark-obsidian',
  activeProfile: 'Coding',
  hotkey: 'Alt + Space',
  holdToSpeak: true,
  autoPunctuation: true,
  removeFillers: true,
  casingShortcut: true,
  soundFeedback: true,
  telemetryEnabled: false,
  retainAudio: false,
  retentionDays: 7,
  permissionPolicy: 'dry_run_first',
  userLevel: 'basic',
};

export const defaultVoiceProfile: VoiceProfile = {
  enrolled: false,
  confidenceScore: 0,
  guestPolicy: 'guest_dictation_only',
  sampleCount: 0,
};

export const defaultAssistantVoice: AssistantVoiceSettings = {
  voiceId: 'calm-assistant-en',
  provider: 'local',
  speed: 1.0,
  pitch: 1.0,
  tone: 'calm',
  replyPolicy: 'conversation_only',
};
