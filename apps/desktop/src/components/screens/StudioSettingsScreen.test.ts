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

  it('renders a responsive compact two/three-column radio picker with two swatches', () => {
    expect(screen).toContain('role="radiogroup"');
    expect(screen).toContain('role="radio"');
    expect(screen).toContain('theme-picker__swatch--neutral');
    expect(styles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  });

  it('preserves roving focus for arrows, Home, and End', () => {
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']) expect(screen).toContain(`event.key === '${key}'`);
    expect(screen).toContain('tabIndex={settings.theme === id ? 0 : -1}');
    expect(screen).toContain('themeOptionRefs.current[next]?.focus()');
  });
});
