import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('./components/DesktopSidebar.tsx', import.meta.url), 'utf8');
const overview = readFileSync(new URL('./components/screens/OverviewScreen.tsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('./components/screens/StudioSettingsScreen.tsx', import.meta.url), 'utf8');

describe('Wave 2 UI accessibility contracts', () => {
  it('exposes a keyboard-operable sidebar separator', () => {
    expect(app).toContain('aria-valuemin={180}');
    expect(app).toContain('aria-valuemax={360}');
    expect(app).toContain('onKeyDown={resizeSidebarByKeyboard}');
    expect(app).toContain("event.key === 'Home'");
    expect(app).toContain("event.key === 'End'");
  });

  it('keeps shared focus affordances and top-level dialog hooks', () => {
    expect(sidebar).toContain('sori-focus-ring');
    expect(overview).toContain('sori-focus-ring');
    expect(app).toContain('const settingsDialogRef = useRef');
    expect(app).toContain('settingsTriggerRef.current?.focus()');
    expect(app).toContain("event.key !== 'Tab'");
    expect(app).not.toMatch(/refreshHistory[\s\S]{0,500}useRef/);
  });

  it('wires the four semantic palettes through settings and the root shell', () => {
    expect(app).toContain('data-sori-theme={theme}');
    expect(app).toContain('readShellPreferences()');
    expect(app).toContain('writeShellPreferences');
    expect(app).toContain("theme: readShellPreferences().theme");
    expect(settings).toContain('themeLabels[id]');
  });
  it('locks the global 10px surface and borderless selection contracts', () => {
    const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
    expect(css).toContain('--sori-card-radius: 10px;');
    expect(css).toMatch(/\.sori-sidebar-item\[aria-current='page'\][\s\S]*border-color: transparent !important/);
    expect(css).toContain('.settings-tab--active { border-color:transparent;');
    expect(css).toContain('.sori-empty-state');
  });

  it('keeps the app root and workspace as the only scroll owners', () => {
    const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
    expect(css).toContain('#root {');
    expect(css).toContain('width: 100%;');
    expect(css).toContain('height: 100%;');
    expect(css).toContain('overflow: hidden;');
    expect(css).toContain('padding: 0;');
    expect(css).toContain('overflow-y: auto;');
    expect(css).not.toContain('margin-top: calc(-1 *');
    expect(css).not.toContain('min-height: calc(100dvh - var(--sori-titlebar-height))');
  });

  it('keeps the refined shell connected with a subtle content seam and resize track', () => {
    const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
    expect(readFileSync(new URL('../design-system/tokens.css', import.meta.url), 'utf8')).toContain('--sori-shell-radius: 15px;');
    expect(css).toMatch(/\.sori-shell__titlebar \{\s*border: 0;/);
    expect(css).toMatch(/\.sori-shell__workspace \{\s*border: 0;\s*border-radius: var\(--sori-radius-md\) 0 var\(--sori-shell-radius\) var\(--sori-radius-md\);/);
    expect(css).toMatch(/\.sori-sidebar-divider::after,\s*\.sori-sidebar-divider:hover::after/);
    expect(css).toContain('grid-template-columns: minmax(0, var(--sori-sidebar-width-live, var(--sori-sidebar-width))) 9px minmax(0, 1fr);');
    expect(css).toMatch(/\.sori-sidebar-divider \{ background: transparent; \}/);
    expect(css).toMatch(/\.sori-sidebar-divider::after,\s*\.sori-sidebar-divider:hover::after,\s*\.sori-sidebar-divider:active::after \{[\s\S]*?width: 1px;[\s\S]*?background: var\(--sori-shell-divider\);/);
  });
});
