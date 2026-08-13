import { describe, expect, it } from 'vitest';
import { titlebarRouteLabel } from './DesktopTitleBar';

describe('titlebar capability labels', () => {
  it('does not present a preview model as an active route when runtime is unavailable', () => {
    expect(titlebarRouteLabel('unavailable', 'Whisper Q5')).toBe('Route: UNVERIFIED');
    expect(titlebarRouteLabel('mock', 'Whisper Q5')).toBe('Route: UNVERIFIED');
  });

  it('shows the model only for a connected runtime', () => {
    expect(titlebarRouteLabel('backend', 'Whisper Q5')).toBe('Route: Whisper Q5');
  });
});
