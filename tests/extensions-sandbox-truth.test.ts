import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('apps/desktop/src/components/screens/ExtensionsSandboxScreen.tsx', 'utf8');

describe('extensions screen truth boundary', () => {
  it('does not present a hardcoded available catalog when install is unavailable', () => {
    expect(source).not.toContain('const available =');
    expect(source).not.toContain('Available extensions');
    expect(source).toContain('Catalog unavailable');
    expect(source).toContain('No extensions are presented as available.');
  });
});
