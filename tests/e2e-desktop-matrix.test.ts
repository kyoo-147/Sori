import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('desktop E2E matrix contract', () => {
  const script = readFileSync(resolve(process.cwd(), 'scripts/e2e-desktop-matrix.ts'), 'utf8');
  const docs = readFileSync(resolve(process.cwd(), 'docs/e2e/desktop-matrix.md'), 'utf8');

  it('keeps the executable matrix truthful and isolated', () => {
    expect(script).toContain("refusing matrix: stale daemon already owns 127.0.0.1:17373");
    expect(script).toContain("This matrix proves daemon IPC, semantic desktop UI, responsive preview controls, and rendered states only");
    expect(script).toContain("it does not prove microphone, Whisper, hotkey, overlay, or OS text injection");
    expect(script).toContain("review: 'pending'");
  });

  it('covers viewport and resilient-state fixtures', () => {
    for (const value of ['Desktop', 'Tablet', 'Mobile', 'Empty', 'Loading', 'Error', 'visual-review-manifest.json']) {
      expect(script).toContain(value);
    }
    expect(docs).toContain('npm run e2e:desktop-matrix');
    expect(docs).toContain('does **not** prove microphone capture');
  });
});
