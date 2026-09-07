import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { soriThemes, themePalettes } from './tokens';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

describe('shared palette tokens', () => {
  it('keeps the four public themes mapped to one primary and one accent', () => {
    expect(Object.keys(themePalettes)).toEqual(['clear', 'brown', 'green', 'blue']);
    for (const theme of soriThemes) {
      const palette = themePalettes[theme];
      expect(palette.primary).toMatch(/^#[0-9A-F]{6}$/);
      expect(palette.accent).toMatch(/^#[0-9A-F]{6}$/);
      expect(palette.accent).toMatch(/^#[0-9A-F]{6}$/);
      expect(css).toContain(`[data-sori-theme='${theme}']`);
      expect(css).toContain(`--sori-primary: ${palette.primary}`);
      expect(css).toContain(`--sori-accent: ${palette.accent}`);
    }
  });

  it('exposes shared semantic hooks and geometry aliases', () => {
    for (const token of ['--sori-button-bg', '--sori-badge-bg', '--sori-input-bg', '--sori-card-bg', '--sori-focus-ring', '--sori-sidebar-bg', '--sori-topbar-bg']) {
      expect(css).toContain(token);
    }
    expect(css).toContain('--sori-control-height: 36px');
    expect(css).toContain('--sori-card-radius: var(--sori-radius-lg)');
    for (const token of ['--sori-settings-modal-bg', '--sori-settings-surface', '--sori-settings-sidebar', '--sori-settings-border', '--sori-settings-selected', '--sori-settings-input', '--sori-settings-muted', '--sori-settings-accent']) expect(css).toContain(token);
  });

  it('locks the compact four-theme palette values and settings geometry', () => {
    expect(themePalettes).toEqual({
      clear: { primary: '#3B6F8F', accent: '#3B6F8F' },
      brown: { primary: '#A35C2D', accent: '#A35C2D' },
      green: { primary: '#159466', accent: '#159466' },
      blue: { primary: '#2563EB', accent: '#2563EB' },
    });
    expect(css).toContain('--sori-settings-modal-bg: #FFFFFF');
    expect(css).toContain('--sori-settings-sidebar: #F7F7F6');
    expect(css).toContain('--sori-settings-radius: 5px');
    expect(css).toContain('--sori-settings-modal-radius: 7px');
  });

});
