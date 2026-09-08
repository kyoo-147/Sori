import { describe, expect, it } from 'vitest';
import { getThemePickerPlacement } from './theme-picker-placement';

describe('theme picker placement', () => {
  it('keeps the full menu below when there is room', () => {
    expect(getThemePickerPlacement({ above: 120, below: 400, menuHeight: 364 })).toEqual({ placement: 'below', maxHeight: 364 });
  });

  it('flips above when the modal edge clips the menu below', () => {
    expect(getThemePickerPlacement({ above: 420, below: 80, menuHeight: 364 })).toEqual({ placement: 'above', maxHeight: 364 });
  });

  it('retains every option in a contained scroll region when neither side fits', () => {
    expect(getThemePickerPlacement({ above: 130, below: 110, menuHeight: 364 })).toEqual({ placement: 'above', maxHeight: 130 });
  });
});
