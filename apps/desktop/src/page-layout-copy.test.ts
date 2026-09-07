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
    expect(source).toContain('space-y-6');
    expect(source).toMatch(/<header(?:\s[^>]*)?>/);
    expect(source).toContain('sori-page-heading');
  });

  it('keeps one shared page geometry and the approved shell radii', () => {
    const css = read('./index.css');
    expect(css).toMatch(/\.sori-page-layout\s*\{[^}]*max-width: 1180px;[^}]*padding: 16px;/s);
    expect(css).toMatch(/\.sori-page-layout > header \.sori-body-text\s*\{[^}]*max-width: 44rem;[^}]*margin-top: 4px;/s);
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
