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
    semantic: {
      success: { text: '#1F6B43', bg: '#EAF6EE', border: '#CBE5D4' },
      warning: { text: '#8A5A16', bg: '#FBF3E3', border: '#EEDDB8' },
      error: { text: '#A33A3A', bg: '#F9EAEA', border: '#E8C5C5' },
      info: { text: '#3E607D', bg: '#EAF1F7', border: '#CADAE8' },
    },
  },
  spacing: { 0: '0px', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 7: '32px', 8: '40px', 9: '48px' },
  radius: { xs: '6px', sm: '8px', md: '10px', lg: '14px', xl: '18px', pill: '999px' },
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
    overlay: { bg: 'rgba(255, 255, 255, 0.82)', backdropFilter: 'blur(24px) saturate(130%)', border: '1px solid rgba(203, 208, 214, 0.86)', borderRadius: '18px', boxShadow: '0 18px 44px rgba(26, 31, 36, 0.10)' },
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
