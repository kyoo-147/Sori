import { describe, expect, it } from 'vitest';
import { titlebarCaptureDisabled, titlebarCaptureLabel, titlebarRouteLabel } from './DesktopTitleBar';

describe('titlebar capability labels', () => {
  it('does not present a preview model as an active route when runtime is unavailable', () => {
    expect(titlebarRouteLabel('unavailable', 'Whisper Q5')).toBe('Route: UNVERIFIED');
    expect(titlebarRouteLabel('mock', 'Whisper Q5')).toBe('Route: UNVERIFIED');
  });

  it('shows the model only for a connected runtime', () => {
    expect(titlebarRouteLabel('backend', 'Whisper Q5')).toBe('Route: Whisper Q5');
  });
});

describe('titlebar dictation capability labels', () => {
  it('disables capture in mock and unavailable preview states', () => {
    expect(titlebarCaptureDisabled('mock')).toBe(true);
    expect(titlebarCaptureDisabled('unavailable')).toBe(true);
    expect(titlebarCaptureDisabled('backend')).toBe(false);
  });

  it('does not call browser preview capture a listening state', () => {
    expect(titlebarCaptureLabel('unavailable', false)).toBe('Dictation unavailable');
    expect(titlebarCaptureLabel('backend', false)).toBe('Start daemon dictation');
    expect(titlebarCaptureLabel('backend', true)).toBe('Stop daemon dictation');
  });
});
