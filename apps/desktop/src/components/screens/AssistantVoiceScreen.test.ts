import { describe, expect, it } from 'vitest';
import { assistantVoicePreferencePatch } from './AssistantVoiceScreen';

describe('assistant voice preference wiring', () => {
  it('builds a full persisted value without mutating current state', () => {
    const current = { voiceId: 'calm-assistant-en', provider: 'local' as const, speed: 1, pitch: 1, tone: 'calm' as const, replyPolicy: 'never' as const };
    const next = assistantVoicePreferencePatch(current, { speed: 1.2, replyPolicy: 'short_confirmations' });
    expect(next).toEqual({ ...current, speed: 1.2, replyPolicy: 'short_confirmations' });
    expect(current.speed).toBe(1);
  });
});
