import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const productionScreens = [
  'OverviewScreen.tsx',
  'FirstRunOnboardingScreen.tsx',
  'VoiceEditScreen.tsx',
  'ModelManagerScreen.tsx',
  'BenchmarkScreen.tsx',
  'DictionarySnippetsScreen.tsx',
  'ExtensionsSandboxScreen.tsx',
  'VoiceIdentityScreen.tsx',
  'AssistantVoiceScreen.tsx',
  'CoverageChecklistScreen.tsx',
  'SystemDesignScreen.tsx',
  'StudioSettingsScreen.tsx',
];

const screenSource = (name: string) => read(`./components/screens/${name}`);

describe('production page layout and copy contracts', () => {
  it.each(productionScreens)('%s uses the Overview page frame and title rhythm', (name) => {
    const source = screenSource(name);
    expect(source).toContain('sori-page-layout');
    expect(source).toContain('sori-page-layout');
    expect(source).toMatch(/<header(?:\s[^>]*)?>/);
    expect(source).toContain('sori-page-heading');
  });

  it('defines one shared page rhythm instead of per-screen spacing', () => {
    const tokens = read('../design-system/tokens.css');
    const css = read('./index.css');
    for (const token of ['--sori-page-top', '--sori-header-title-gap', '--sori-title-description-gap', '--sori-header-content-gap', '--sori-section-gap', '--sori-card-gap', '--sori-page-horizontal-padding']) expect(tokens).toContain(token);
    expect(css).toContain('gap: var(--sori-section-gap);');
    expect(css).toContain('padding: var(--sori-page-top) var(--sori-page-horizontal-padding);');
    expect(css).toContain('header + * { margin-block-start: var(--sori-header-content-gap) !important; }');
  });

  it('keeps one shared page geometry and the approved shell radii', () => {
    const css = read('./index.css');
    expect(css).toContain('max-width: 1180px;');
    expect(css).toContain('padding: var(--sori-page-top) var(--sori-page-horizontal-padding);');
    expect(css).toContain('max-width: 44rem;');
    expect(css).toContain('margin-top: var(--sori-title-description-gap);');
    expect(css).toContain('--sori-shell-radius: 15px;');
    expect(css).toContain('border-radius: 15px 0 var(--sori-shell-radius) 15px;');
    expect(css).toContain('border-radius: 5px !important;');
  });

  it('removes the old documentation-style headers and setup eyebrow', () => {
    const combined = productionScreens.map(screenSource).join('\n');
    expect(combined).not.toContain('Settings / Labs — Spoken Replies');
    expect(combined).not.toContain('Sori System Design & Color Architecture');
    expect(combined).not.toContain('First Run Setup</div>');
    expect(combined).not.toContain('Vocabulary &amp; domain terms');
    expect(combined).not.toContain('canonical IPC contract');
  });
});
