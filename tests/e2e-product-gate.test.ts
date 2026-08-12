import { describe, expect, it } from 'vitest';
import { PRODUCT_NAVIGATION, UNVERIFIED_HARDWARE_CAPABILITIES } from '../scripts/e2e-product-gate.js';

describe('sequential product E2E gate contract', () => {
  it('keeps every primary desktop route in the semantic navigation sequence', () => {
    expect(PRODUCT_NAVIGATION.map(({ label }) => label)).toEqual([
      'Home',
      'Transcripts',
      'Vocabulary',
      'Voice Edit',
      'Models & Routing',
      'Benchmarks',
      'Extensions',
      'Privacy',
      'Diagnostics',
      'Settings',
      'First-Run Setup',
    ]);
    for (const flow of PRODUCT_NAVIGATION) expect(flow.expected.length).toBeGreaterThanOrEqual(2);
  });

  it('names hardware capabilities as unverified instead of treating the browser gate as voice proof', () => {
    expect(UNVERIFIED_HARDWARE_CAPABILITIES).toEqual([
      'global hotkey',
      'physical microphone capture',
      'Whisper model inference',
      'focused-app text injection',
    ]);
  });
});
