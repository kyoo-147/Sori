export type ThemePickerPlacement = 'below' | 'above';

export interface ThemePickerSpace {
  above: number;
  below: number;
  menuHeight: number;
}

export function getThemePickerPlacement({ above, below, menuHeight }: ThemePickerSpace): { placement: ThemePickerPlacement; maxHeight: number } {
  const placement: ThemePickerPlacement = below >= menuHeight || below >= above ? 'below' : 'above';
  const available = placement === 'below' ? below : above;
  return { placement, maxHeight: Math.max(1, Math.min(menuHeight, available)) };
}
