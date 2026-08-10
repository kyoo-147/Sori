/**
 * Sori desktop design tokens.
 *
 * This is the TypeScript source of truth for values also exposed in tokens.css.
 * Keep semantic names stable so native/Tauri clients can consume the same system.
 */
export const systemDesignTokens = {
  palette: {
    background: { canvas: '#F6F6F4', app: '#FBFBFA', sidebar: '#F3F3F1', panel: '#FFFFFF', panelSubtle: '#F8F8F7', elevated: 'rgba(255, 255, 255, 0.72)' },
    text: { primary: '#161616', secondary: '#5F6368', tertiary: '#858A90', quiet: '#A3A7AD', inverse: '#FFFFFF' },
    border: { default: '#E2E4E8', soft: '#ECEDEE', strong: '#CDD1D5', focus: '#BAC7D8' },
    fill: { hover: '#F0F1F2', active: '#E9EBEE', selected: '#E8EDF4', disabled: '#F5F5F5' },
    accent: { primary: '#5C728A', primarySoft: '#E8EEF4', primaryBorder: '#C9D6E3', btnBg: '#EEF2F6', btnText: '#24384C', btnBorder: '#D5E0EA', btnHover: '#E1E8F0' },
    semantic: {
      success: { text: '#1F6B43', bg: '#EAF6EE', border: '#CBE5D4' },
      warning: { text: '#8A5A16', bg: '#FBF3E3', border: '#EEDDB8' },
      error: { text: '#A33A3A', bg: '#F9EAEA', border: '#E8C5C5' },
      info: { text: '#3E607D', bg: '#EAF1F7', border: '#CADAE8' },
    },
  },
  glass: {
    light: { bg: 'rgba(255, 255, 255, 0.68)', backdropFilter: 'blur(18px) saturate(120%)', border: '1px solid rgba(210, 214, 220, 0.72)', boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.65)' },
    strong: { bg: 'rgba(255, 255, 255, 0.76)', backdropFilter: 'blur(24px) saturate(130%)', border: '1px solid rgba(203, 208, 214, 0.86)', boxShadow: '0 12px 36px rgba(0, 0, 0, 0.06)' },
    overlay: { bg: 'rgba(255, 255, 255, 0.82)', backdropFilter: 'blur(24px) saturate(120%)', border: '1px solid rgba(203, 208, 214, 0.86)', borderRadius: '18px', boxShadow: '0 16px 40px rgba(0, 0, 0, 0.07)' },
  },
  buttons: {
    primary: 'bg-[#EEF2F6] hover:bg-[#E1E8F0] text-[#24384C] border border-[#D5E0EA] font-medium transition-all shadow-2xs',
    secondary: 'bg-white hover:bg-[#F6F7F9] text-[#2B2F33] border border-[#E2E4E8] font-medium transition-all shadow-2xs',
    ghost: 'bg-transparent hover:bg-[#F0F1F2] text-[#4A4E54] font-medium transition-all',
    destructive: 'bg-[#F9EAEA] hover:bg-[#F3DFDF] text-[#A33A3A] border border-[#E8C5C5] font-medium transition-all',
    glass: 'sori-glass hover:bg-white/90 text-[#161616] font-medium border border-[#E2E4E8] shadow-2xs transition-all',
  },
  typography: {
    fontFamily: '"Geist", "SF Pro Text", "SF Pro Display", "Avenir Next", "Inter", system-ui, -apple-system, sans-serif',
    monoFamily: '"Geist Mono", "SF Mono", "JetBrains Mono", ui-monospace, monospace',
    pageHeading: 'text-[26px] leading-[32px] font-semibold tracking-[-0.02em] text-[#161616]',
    sectionHeading: 'text-[18px] leading-[26px] font-semibold tracking-[-0.01em] text-[#161616]',
    body: 'text-[14.5px] leading-[22px] font-normal text-[#5F6368]',
    sidebar: 'text-[13.5px] leading-[20px] font-medium text-[#161616]',
    button: 'text-[13px] leading-[18px] font-medium',
    meta: 'text-[12px] leading-[18px] font-normal text-[#858A90]',
    code: 'font-mono text-[12.5px] leading-[20px] font-normal text-[#161616]',
  },
} as const;

export type DesignTokens = typeof systemDesignTokens;
