import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const voiceIdentity = readFileSync(new URL('./VoiceIdentityScreen.tsx', import.meta.url), 'utf8');
const studioSettings = readFileSync(new URL('./StudioSettingsScreen.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

describe('Wave 3 final UI contracts', () => {
  it('implements an accessible delete-history dialog lifecycle', () => {
    expect(voiceIdentity).toContain('role="dialog"');
    expect(voiceIdentity).toContain('aria-modal="true"');
    expect(voiceIdentity).toContain('aria-labelledby="delete-history-title"');
    expect(voiceIdentity).toContain("event.key === 'Escape'");
    expect(voiceIdentity).toContain("event.key !== 'Tab'");
    expect(voiceIdentity).toContain('previouslyFocused?.focus()');
    expect(voiceIdentity).toContain('data-dialog-initial-focus');
  });

  it('does not ship a replacement character in settings loading copy', () => {
    expect(studioSettings).toContain('Loading canonical settings...');
    expect(studioSettings).not.toContain('Loading canonical settings�');
  });

  it('keeps the settings dialog label target unique', () => {
    expect(app).toContain('aria-labelledby="settings-dialog-title"');
    expect(app.match(/id="settings-dialog-title"/g)).toHaveLength(1);
    expect(studioSettings).not.toContain('id="settings-dialog-title"');
  });
});
