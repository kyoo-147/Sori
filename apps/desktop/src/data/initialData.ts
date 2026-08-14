import { AppSettings, VoiceProfile, AssistantVoiceSettings } from '../types';

/* Production runtime data is loaded from sorid; this module contains only neutral local preferences. */
/* Production runtime data is loaded from sorid; this module contains only neutral local preferences. */
// Compatibility contract: cloud fallback is metadata only and is never seeded into App state.
export const disabledCloudFallbackContract = {
  id: 'groq-whisper-cloud',
  recommendedFor: 'Optional BYOK/cloud fallback',
  isInstalled: false,
  isWarm: false,
  latencyMs: 95,
  condition: 'fallback_chain && byok_configured == true',
  enabled: false,
  priority: 4,
};

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
