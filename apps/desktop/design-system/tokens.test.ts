import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { soriThemes, themeLabels, themePalettes } from './tokens';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

const expected = {
  clear: { primary: '#2F6F91', accent: '#2F6F91', hover: '#245A78', pressed: '#1B475F', soft: '#EAF4FA', background: '#FFFFFF', surface: '#FFFFFF', sidebar: '#F7F7F7', border: '#E1E7EC', text: '#17202A', muted: '#66717D', filledForeground: '#FFFFFF' },
  blue: { primary: '#2563EB', accent: '#2563EB', hover: '#1D4ED8', pressed: '#1E40AF', soft: '#EAF2FF', background: '#FCFDFF', surface: '#FFFFFF', sidebar: '#F5F8FC', border: '#DDE4EC', text: '#18212B', muted: '#5E6975', filledForeground: '#FFFFFF' },
  azure: { primary: '#0787D1', accent: '#0787D1', hover: '#006FAE', pressed: '#005A8E', soft: '#E5F5FF', background: '#FCFEFF', surface: '#FFFFFF', sidebar: '#F3F9FC', border: '#D9E8F0', text: '#13232D', muted: '#60717B', filledForeground: '#071117' },
  green: { primary: '#159466', accent: '#159466', hover: '#0C7C55', pressed: '#086445', soft: '#E7F7F0', background: '#FCFEFD', surface: '#FFFFFF', sidebar: '#F3F8F5', border: '#DAE5DF', text: '#18231E', muted: '#606B65', filledForeground: '#07140D' },
  forest: { primary: '#167A4A', accent: '#167A4A', hover: '#0E623B', pressed: '#0A4F2F', soft: '#E8F5EC', background: '#FCFEFC', surface: '#FFFFFF', sidebar: '#F4F8F4', border: '#DCE7DE', text: '#172219', muted: '#626E65', filledForeground: '#FFFFFF' },
  brown: { primary: '#A35C2D', accent: '#A35C2D', hover: '#884820', pressed: '#713A1A', soft: '#FAEEE5', background: '#FFFDFC', surface: '#FFFFFF', sidebar: '#F8F4F0', border: '#E8DED6', text: '#241D19', muted: '#70655E', filledForeground: '#FFFFFF' },
  golden: { primary: '#B78331', accent: '#B78331', hover: '#936821', pressed: '#765117', soft: '#FBF3E3', background: '#FFFDF9', surface: '#FFFFFF', sidebar: '#F9F6EF', border: '#E9E1D4', text: '#26221B', muted: '#746D61', filledForeground: '#26221B' },
  terracotta: { primary: '#D45B38', accent: '#D45B38', hover: '#B74728', pressed: '#94361D', soft: '#FDEDE8', background: '#FFFDFC', surface: '#FFFFFF', sidebar: '#FAF5F2', border: '#ECDDD7', text: '#281C18', muted: '#75645E', filledForeground: '#1A100C' },
  wisteria: { primary: '#6D5CE7', accent: '#6D5CE7', hover: '#5748C8', pressed: '#4437A8', soft: '#F0EEFF', background: '#FDFCFF', surface: '#FFFFFF', sidebar: '#F7F5FC', border: '#E4E0F1', text: '#211D2B', muted: '#696476', filledForeground: '#FFFFFF' },
  ink: { primary: '#262B33', accent: '#262B33', hover: '#11151B', pressed: '#05070A', soft: '#EEF0F2', background: '#FDFDFD', surface: '#FFFFFF', sidebar: '#F6F6F6', border: '#DFE1E4', text: '#15171A', muted: '#656A70', filledForeground: '#FFFFFF' },
} as const;

describe('shared palette tokens', () => {
  it('bundles Instrument Sans for offline UI and preserves mono exceptions', () => {
    expect(css).toContain("font-family: 'Instrument Sans';");
    expect(css).toContain("url('../src/assets/fonts/InstrumentSans[wdth,wght].woff2') format('woff2')");
    expect(css).toContain('font-weight: 400 700;');
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).toContain('--sori-font-sans: "Instrument Sans", system-ui, sans-serif;');
    expect(css).toContain('--sori-font-mono: "Geist Mono", "SF Mono", "JetBrains Mono", ui-monospace, monospace;');
  });
  it('uses one 10px geometry for cards, controls, overlays, and settings', () => {
    expect(css).toContain('--sori-card-radius: 10px;');
    expect(css).toContain('--sori-control-radius: 10px;');
    expect(css).toContain('--sori-overlay-radius: 10px;');
    expect(css).toContain('--sori-settings-radius: 10px;');
    expect(css).toContain('--sori-settings-modal-radius: 10px;');
  });
  it('locks the ten stable IDs, short labels, and captain palette values', () => {
    expect(soriThemes).toEqual(['clear', 'blue', 'azure', 'green', 'forest', 'brown', 'golden', 'terracotta', 'wisteria', 'ink']);
    expect(themeLabels).toEqual({ clear: 'Clear', blue: 'Cobalt', azure: 'Azure', green: 'Emerald', forest: 'Forest', brown: 'Cognac', golden: 'Golden', terracotta: 'Terracotta', wisteria: 'Wisteria', ink: 'Ink' });
    expect(themePalettes).toEqual(expected);
  });

  it('mirrors every palette value into the CSS theme contract', () => {
    for (const theme of soriThemes) {
      const palette = expected[theme];
      expect(css).toContain(`[data-sori-theme='${theme}']`);
      expect(css).toContain(`--sori-primary: ${palette.primary}`);
      expect(css).toContain(`--sori-primary-hover: ${palette.hover}`);
      expect(css).toContain(`--sori-primary-pressed: ${palette.pressed}`);
      expect(css).toContain(`--sori-accent-soft: ${palette.soft}`);
      expect(css).toContain(`--sori-bg-canvas: ${palette.background}`);
      expect(css).toContain(`--sori-bg-panel: ${palette.surface}`);
      expect(css).toContain(`--sori-bg-sidebar: ${palette.sidebar}`);
      expect(css).toContain(`--sori-border-default: ${palette.border}`);
      expect(css).toContain(`--sori-text-primary: ${palette.text}`);
      expect(css).toContain(`--sori-text-secondary: ${palette.muted}`);
    }
  });

  it('keeps status semantics global and settings surfaces opaque', () => {
    for (const token of ['--sori-success-text', '--sori-warning-text', '--sori-error-text', '--sori-info-text']) {
      expect(css.match(new RegExp(`${token}:`, 'g'))).toHaveLength(1);
    }
    expect(css).toContain('--sori-settings-surface: var(--sori-bg-panel)');
    expect(css).toContain('--sori-settings-sidebar: var(--sori-bg-panel)');
    expect(css).not.toContain('--sori-settings-sidebar: rgba');
  });

  it('keeps filled controls WCAG AA readable for every preset', () => {
    const luminance = (hex: string) => { const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]; };
    const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    for (const theme of soriThemes) expect(contrast(themePalettes[theme].primary, themePalettes[theme].filledForeground)).toBeGreaterThanOrEqual(4.5);
  });

});
