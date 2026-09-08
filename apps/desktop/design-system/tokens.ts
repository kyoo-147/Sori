/**
 * Sori desktop design tokens.
 *
 * This is the TypeScript mirror of design-system/tokens.css. Keep semantic
 * names stable so React and native/Tauri clients can consume the same system.
 */
export const systemDesignTokens = {
  palette: {
    background: { canvas: '#F6F6F4', app: '#FBFBFA', sidebar: '#F3F3F1', panel: '#FFFFFF', panelSubtle: '#F8F8F7', elevated: 'rgba(255, 255, 255, 0.72)' },
    text: { primary: '#161616', secondary: '#5F6368', tertiary: '#858A90', quiet: '#A3A7AD', inverse: '#FFFFFF' },
    border: { default: '#E2E4E8', soft: '#ECEDEE', strong: '#CDD1D5', focus: '#8DA4BC' },
    fill: { hover: '#F0F1F2', active: '#E9EBEE', selected: '#E8EDF4', disabled: '#F5F5F5' },
    accent: { primary: '#5C728A', primarySoft: '#E8EEF4', primaryBorder: '#C9D6E3', btnBg: '#EEF2F6', btnText: '#24384C', btnBorder: '#D5E0EA', btnHover: '#E1E8F0' },
    settings: { modal: '#FFFFFF', surface: 'var(--sori-bg-panel)', sidebar: 'var(--sori-bg-panel)', hover: 'var(--sori-fill-hover)', active: 'var(--sori-fill-active)', selected: 'var(--sori-fill-selected)', input: '#FFFFFF', border: 'var(--sori-border-default)', help: 'var(--sori-text-secondary)' },
    semantic: {
      success: { text: '#1F6B43', bg: '#EAF6EE', border: '#CBE5D4' },
      warning: { text: '#8A5A16', bg: '#FBF3E3', border: '#EEDDB8' },
      error: { text: '#A33A3A', bg: '#F9EAEA', border: '#E8C5C5' },
      info: { text: '#3E607D', bg: '#EAF1F7', border: '#CADAE8' },
    },
  },
  spacing: { 0: '0px', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 7: '32px', 8: '40px', 9: '48px' },
  radius: { xs: '4px', sm: '10px', md: '10px', lg: '10px', xl: '10px', pill: '999px' },
  geometry: { controlHeight: '36px', controlRadius: '10px', cardRadius: '10px', overlayRadius: '10px', settingsRadius: '10px', settingsModalRadius: '10px' },
  shadows: {
    none: '0 0 transparent',
    xs: '0 1px 2px rgba(26, 31, 36, 0.04)',
    sm: '0 4px 12px rgba(26, 31, 36, 0.05)',
    md: '0 10px 28px rgba(26, 31, 36, 0.07)',
    lg: '0 18px 44px rgba(26, 31, 36, 0.10)',
    inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.72)',
  },
  layout: {
    titlebarHeight: '40px',
    sidebarWidth: '248px',
    railWidth: '248px',
    inspectorWidth: '320px',
    inspectorMin: '220px',
    workspacePadding: '24px',
    paneGap: '16px',
    breakpoints: { compact: '1199px', narrow: '899px', mobile: '767px' },
  },
  motion: { fast: '120ms', standard: '180ms', layout: '240ms' },
  glass: {
    light: { bg: 'rgba(255, 255, 255, 0.68)', backdropFilter: 'blur(18px) saturate(120%)', border: '1px solid rgba(210, 214, 220, 0.72)', boxShadow: '0 4px 12px rgba(26, 31, 36, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.72)' },
    strong: { bg: 'rgba(255, 255, 255, 0.76)', backdropFilter: 'blur(24px) saturate(130%)', border: '1px solid rgba(203, 208, 214, 0.86)', boxShadow: '0 10px 28px rgba(26, 31, 36, 0.07)' },
    overlay: { bg: 'rgba(255, 255, 255, 0.82)', backdropFilter: 'blur(24px) saturate(130%)', border: '1px solid rgba(203, 208, 214, 0.86)', borderRadius: '10px', boxShadow: '0 18px 44px rgba(26, 31, 36, 0.10)' },
  },
  typography: {
    fontFamily: '"Geist", "SF Pro Text", "SF Pro Display", "Avenir Next", "Inter", system-ui, -apple-system, sans-serif',
    monoFamily: '"Geist Mono", "SF Mono", "JetBrains Mono", ui-monospace, monospace',
    pageHeading: '26px/32px',
    sectionHeading: '18px/26px',
    body: '14.5px/22px',
    sidebar: '13.5px/20px',
    button: '13px/18px',
    meta: '12px/18px',
    code: '12.5px/20px',
  },
} as const;

export type DesignTokens = typeof systemDesignTokens;

/** Stable persisted palette IDs. Existing IDs remain unchanged as the contract grows. */
export const soriThemes = ['clear', 'blue', 'azure', 'green', 'forest', 'brown', 'golden', 'terracotta', 'wisteria', 'ink'] as const;
export type SoriTheme = (typeof soriThemes)[number];
export const themeLabels: Record<SoriTheme, string> = {
  clear: 'Clear', blue: 'Cobalt', azure: 'Azure', green: 'Emerald', forest: 'Forest',
  brown: 'Cognac', golden: 'Golden', terracotta: 'Terracotta', wisteria: 'Wisteria', ink: 'Ink',
};

export interface ThemePalette {
  primary: string;
  accent: string;
  hover: string;
  pressed: string;
  soft: string;
  background: string;
  surface: string;
  sidebar: string;
  border: string;
  text: string;
  muted: string;
  filledForeground: string;
}

/** One neutral base and one accent family per preset; status colors remain global. */
export const themePalettes: Record<SoriTheme, ThemePalette> = {
  clear: { primary: '#2F6F91', accent: '#2F6F91', hover: '#245A78', pressed: '#1B475F', soft: '#EAF4FA', background: '#FCFDFE', surface: '#FFFFFF', sidebar: '#F5F8FA', border: '#E1E7EC', text: '#17202A', muted: '#66717D', filledForeground: '#FFFFFF' },
  blue: { primary: '#2563EB', accent: '#2563EB', hover: '#1D4ED8', pressed: '#1E40AF', soft: '#EAF2FF', background: '#FCFDFF', surface: '#FFFFFF', sidebar: '#F5F8FC', border: '#DDE4EC', text: '#18212B', muted: '#5E6975', filledForeground: '#FFFFFF' },
  azure: { primary: '#0787D1', accent: '#0787D1', hover: '#006FAE', pressed: '#005A8E', soft: '#E5F5FF', background: '#FCFEFF', surface: '#FFFFFF', sidebar: '#F3F9FC', border: '#D9E8F0', text: '#13232D', muted: '#60717B', filledForeground: '#071117' },
  green: { primary: '#159466', accent: '#159466', hover: '#0C7C55', pressed: '#086445', soft: '#E7F7F0', background: '#FCFEFD', surface: '#FFFFFF', sidebar: '#F3F8F5', border: '#DAE5DF', text: '#18231E', muted: '#606B65', filledForeground: '#07140D' },
  forest: { primary: '#167A4A', accent: '#167A4A', hover: '#0E623B', pressed: '#0A4F2F', soft: '#E8F5EC', background: '#FCFEFC', surface: '#FFFFFF', sidebar: '#F4F8F4', border: '#DCE7DE', text: '#172219', muted: '#626E65', filledForeground: '#FFFFFF' },
  brown: { primary: '#A35C2D', accent: '#A35C2D', hover: '#884820', pressed: '#713A1A', soft: '#FAEEE5', background: '#FFFDFC', surface: '#FFFFFF', sidebar: '#F8F4F0', border: '#E8DED6', text: '#241D19', muted: '#70655E', filledForeground: '#FFFFFF' },
  golden: { primary: '#B78331', accent: '#B78331', hover: '#936821', pressed: '#765117', soft: '#FBF3E3', background: '#FFFDF9', surface: '#FFFFFF', sidebar: '#F9F6EF', border: '#E9E1D4', text: '#26221B', muted: '#746D61', filledForeground: '#26221B' },
  terracotta: { primary: '#D45B38', accent: '#D45B38', hover: '#B74728', pressed: '#94361D', soft: '#FDEDE8', background: '#FFFDFC', surface: '#FFFFFF', sidebar: '#FAF5F2', border: '#ECDDD7', text: '#281C18', muted: '#75645E', filledForeground: '#1A100C' },
  wisteria: { primary: '#6D5CE7', accent: '#6D5CE7', hover: '#5748C8', pressed: '#4437A8', soft: '#F0EEFF', background: '#FDFCFF', surface: '#FFFFFF', sidebar: '#F7F5FC', border: '#E4E0F1', text: '#211D2B', muted: '#696476', filledForeground: '#FFFFFF' },
  ink: { primary: '#262B33', accent: '#262B33', hover: '#11151B', pressed: '#05070A', soft: '#EEF0F2', background: '#FDFDFD', surface: '#FFFFFF', sidebar: '#F6F6F6', border: '#DFE1E4', text: '#15171A', muted: '#656A70', filledForeground: '#FFFFFF' },
};
/** Apply a palette without changing runtime state or status semantics. */
export function applySoriTheme(theme: SoriTheme, target: HTMLElement = document.documentElement): void {
  target.dataset.soriTheme = theme;
}
