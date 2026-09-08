import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readDesktop = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), 'apps/desktop', relativePath), 'utf8');

const readDoc = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('desktop visual architecture contracts', () => {
  it('keeps CSS and TypeScript token layers complete', () => {
    const css = readDesktop('design-system/tokens.css');
    const ts = readDesktop('design-system/tokens.ts');

    for (const token of [
      '--sori-space-1: 4px',
      '--sori-space-6: 24px',
      '--sori-radius-md: 10px',
      '--sori-radius-xl: 10px',
      '--sori-shadow-xs:',
      '--sori-shadow-lg:',
      '--sori-type-page-size: var(--sori-type-xl-size)',
      '--sori-sidebar-width: 248px',
      '--sori-shell-radius: 15px',
    ]) {
      expect(css).toContain(token);
    }

    expect(ts).toContain('spacing:');
    expect(ts).toContain("radius: { xs: '4px'");
    expect(ts).toContain('shadows:');
    expect(ts).toContain("breakpoints: { compact: '1199px', narrow: '899px', mobile: '767px' }");
  });

  it('defines the real-window shell, pane primitives, and responsive breakpoints', () => {
    const css = readDesktop('src/index.css');
    const app = readDesktop('src/App.tsx');
    const sidebar = readDesktop('src/components/DesktopSidebar.tsx');

    expect(css).toContain("@import '../design-system/tokens.css'");
    for (const primitive of [
      '.sori-shell__titlebar',
      '.sori-shell__body',
      '.sori-shell__sidebar',
      '.sori-shell__workspace',
      '.sori-layout-grid',
      '.sori-layout-split',
      '.sori-layout-pane',
      '.sori-layout-toolbar',
      "[data-sori-collapsed='true']",
    ]) {
      expect(css).toContain(primitive);
    }

    expect(css).toContain('@media (max-width: 1199px)');
    expect(css).toContain('@media (max-width: 899px)');
    expect(css).toContain('@media (max-width: 767px)');
    expect(app).toContain('className="sori-shell select-none');
    expect(app).toContain('className="sori-shell__body flex-1');
    expect(app).toContain('className="sori-shell__workspace');
    expect(sidebar).toContain('className={`${isOpen && !collapsed ? \'flex\' : \'hidden\'} sori-shell__sidebar');
    expect(sidebar).toContain('data-open={isOpen && !collapsed}');
    expect(sidebar).toContain('data-collapsed={collapsed}');
    expect(sidebar).toContain('id="sori-navigation"');
    expect(sidebar).toContain('sori-shell__sidebar-nav');
    expect(sidebar).toContain('sori-shell__sidebar-footer');
    expect(sidebar).toContain("if (screen === 'settings') openSettingsModal()");
    expect(sidebar).not.toContain("navigate('settings'); openSettingsModal()");
    expect(css).toContain('.sori-shell__sidebar-nav');
    expect(css).toContain('overflow-y: auto;');
    expect(css).toContain('.sori-shell__sidebar-footer');
    expect(css).toContain('.sori-sidebar-divider');
    expect(css).toContain('cursor: col-resize;');
    expect(css).toContain('overflow: hidden;');
    expect(css).toContain('height: 100%;');
    expect(css).toContain('height: 100%;');
    expect(css).toContain("grid-template-areas: 'sidebar divider workspace';");
    expect(css).toContain("grid-template-areas: 'workspace workspace workspace';");
    expect(css).toContain(".sori-shell[data-sidebar-collapsed='true'] .sori-sidebar-divider");
    expect(css).toContain('.sori-shell .sori-overlay { z-index: 100; }');
    expect(css).toContain('min-width: 32px;');
    expect(css).toContain('--sori-shell-gap: 12px;');
    expect(css).not.toMatch(/--sori-shell-radius\s*:/);
    expect(css).toContain(".sori-shell[data-window-maximized='true']");
    expect(css).toContain('padding: 0;');
    expect(css).toContain('inset: auto;');
  });

  it('covers keyboard, hover, disabled, pressed, and error states', () => {
    const css = readDesktop('src/index.css');

    expect(css).toContain(':focus-visible');
    expect(css).toContain('.sori-tactile-btn:hover:not(:disabled)');
    expect(css).toContain('.sori-tactile-btn:disabled');
    expect(css).toContain("[aria-pressed='true']");
    expect(css).toContain("[aria-expanded='true']");
    expect(css).toContain("[aria-invalid='true']");
    expect(css).toContain('.sori-error-state');
  });

  it('keeps technical settings inputs on the mono token over shell input defaults', () => {
    const css = readDesktop('src/index.css');

    expect(css).toContain('.sori-shell input.settings-input--mono,');
    expect(css).toContain('.sori-shell textarea.settings-input--mono { font-family: var(--sori-font-mono); }');
  });

  it('documents the presentational boundary and customization knobs', () => {
    const designDoc = readDoc('docs/frontend/design-system.md');
    const shellDoc = readDoc('docs/frontend/desktop-shell.md');

    expect(designDoc).toContain('Customizable layout primitives');
    expect(designDoc).toContain('--sori-inspector-width');
    expect(designDoc).toContain('DeviceFrame');
    expect(shellDoc).toContain('Visual shell contract');
    expect(shellDoc).toContain('must not be used as a runtime layout breakpoint');
  });
});

describe('desktop theme primitives', () => {
  it('keeps the ten user-adjustable palettes and semantic component hooks aligned', () => {
    const css = readDesktop('design-system/tokens.css');
    const ts = readDesktop('design-system/tokens.ts');
    for (const theme of ['clear', 'blue', 'azure', 'green', 'forest', 'brown', 'golden', 'terracotta', 'wisteria', 'ink']) expect(css).toContain(`[data-sori-theme='${theme}']`);
    for (const token of ['--sori-primary:', '--sori-accent:', '--sori-button-bg:', '--sori-badge-bg:', '--sori-input-bg:', '--sori-card-bg:', '--sori-focus-ring:', '--sori-sidebar-bg:', '--sori-topbar-bg:']) expect(css).toContain(token);
    expect(ts).toContain("['clear', 'blue', 'azure', 'green', 'forest', 'brown', 'golden', 'terracotta', 'wisteria', 'ink']");
    expect(ts).toContain('applySoriTheme');
  });
});
