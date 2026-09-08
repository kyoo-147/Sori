import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync(new URL('./StudioSettingsScreen.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./StudioSettingsScreen.css', import.meta.url), 'utf8');

describe('Studio Settings presentation contract', () => {
  it('uses one continuous opaque surface with a sidebar and content divider', () => {
    expect(styles).toContain('grid-template-columns: 196px minmax(0, 1fr)');
    expect(styles).toContain('background: #FFFFFF');
    expect(styles).toContain('border-right: 1px solid var(--sori-settings-border)');
    expect(styles).not.toContain('backdrop-filter');
    expect(styles).not.toMatch(/\.settings-group\s*\{[^}]*border:\s*1px/s);
  });

  it('renders one compact accessible listbox with true theme swatches and checks', () => {
    expect(screen).toContain('aria-haspopup="listbox"');
    expect(screen).toContain('role="listbox"');
    expect(screen).toContain('role="option"');
    expect(screen).toContain('themePalettes[settings.theme].primary');
    expect(screen).toContain('<Check className="theme-picker__check"');
    expect(styles).toContain('.theme-picker__menu');
    expect(styles).toContain('max-height:248px');
    expect(screen).not.toContain('role="radiogroup"');
    expect(screen).not.toContain('theme-picker__swatch--neutral');
  });

  it('preserves keyboard navigation, Escape, outside click, and authoritative settings updates', () => {
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'Escape']) expect(screen).toContain(key);
    expect(screen).toContain('setSettings((current) => ({ ...current, theme: soriThemes[next] }))');
    expect(screen).toContain('document.addEventListener(\'pointerdown\', onPointerDown)');
    expect(screen).toContain('tabIndex={settings.theme === id ? 0 : -1}');
    expect(screen).toContain('themeOptionRefs.current[next]?.focus()');
  });
});
