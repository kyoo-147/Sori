import { describe, expect, it } from 'vitest';
import { shouldRestoreThemeTriggerFocus, themePickerFocusIndex } from './theme-picker-behavior';

describe('theme picker focus behavior', () => {
  it('focuses the selected option when the list opens, with a first-option fallback', () => {
    expect(themePickerFocusIndex(4, 10)).toBe(4);
    expect(themePickerFocusIndex(-1, 10)).toBe(0);
    expect(themePickerFocusIndex(12, 10)).toBe(0);
    expect(themePickerFocusIndex(2, 0)).toBe(-1);
  });

  it('restores trigger focus only for keyboard/selection closes', () => {
    expect(shouldRestoreThemeTriggerFocus('escape')).toBe(true);
    expect(shouldRestoreThemeTriggerFocus('selection')).toBe(true);
    expect(shouldRestoreThemeTriggerFocus('outside')).toBe(false);
    expect(shouldRestoreThemeTriggerFocus('trigger')).toBe(false);
  });
});
