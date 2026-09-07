import { describe, expect, it } from 'vitest';
import { SHELL_PREFERENCES_KEY, defaultShellPreferences, normalizeShellPreferences, normalizeShellTheme, readShellPreferences, writeShellPreferences, type PreferenceStorage } from './shell-preferences';

function memoryStorage(initial?: string): PreferenceStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key) { return key === SHELL_PREFERENCES_KEY ? this.value : null; },
    setItem(key, value) { if (key === SHELL_PREFERENCES_KEY) this.value = value; },
  };
}

describe('shell theme persistence', () => {
  it('accepts every current theme and preserves stable legacy IDs', () => {
    const themes = ['clear', 'blue', 'azure', 'green', 'forest', 'brown', 'golden', 'terracotta', 'wisteria', 'ink'] as const;
    for (const theme of themes) expect(normalizeShellTheme(theme)).toBe(theme);
    expect(normalizeShellTheme('clean-light')).toBe('clear');
    expect(normalizeShellTheme('codex-emerald')).toBe('green');
  });

  it('round-trips a newly selected theme across a reload boundary', () => {
    const storage = memoryStorage();
    writeShellPreferences({ ...defaultShellPreferences, theme: 'wisteria' }, storage);
    expect(readShellPreferences(defaultShellPreferences, storage).theme).toBe('wisteria');
    expect(JSON.parse(storage.value!).theme).toBe('wisteria');
  });

  it('fails closed to the supplied fallback for corrupt or unknown values', () => {
    expect(readShellPreferences(defaultShellPreferences, memoryStorage('{bad json'))).toEqual(defaultShellPreferences);
    expect(normalizeShellPreferences({ version: 1, theme: 'neon' }, { ...defaultShellPreferences, theme: 'ink' }).theme).toBe('ink');
  });
});
