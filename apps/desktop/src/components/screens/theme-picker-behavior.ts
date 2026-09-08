export type ThemePickerCloseReason = 'escape' | 'selection' | 'outside' | 'trigger';

export function themePickerFocusIndex(selectedIndex: number, optionCount: number, preferredIndex = selectedIndex): number {
  if (optionCount <= 0) return -1;
  if (preferredIndex >= 0 && preferredIndex < optionCount) return preferredIndex;
  if (selectedIndex >= 0 && selectedIndex < optionCount) return selectedIndex;
  return 0;
}

export function shouldRestoreThemeTriggerFocus(reason: ThemePickerCloseReason): boolean {
  return reason === 'escape' || reason === 'selection';
}
