import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCoalescedRefresh } from '../apps/desktop/src/App.js';
import { resolveTranscriptViewState } from '../apps/desktop/src/components/screens/TranscriptsScreen.js';

const screen = (name: string) => readFileSync(resolve(process.cwd(), `apps/desktop/src/components/screens/${name}.tsx`), 'utf8');

describe('history and privacy screen truth boundaries', () => {
  it('keeps loading, empty, error, and ready states distinct and fail-closed', () => {
    const source = screen('TranscriptsScreen');
    expect(resolveTranscriptViewState(4, 'loading')).toBe('loading');
    expect(resolveTranscriptViewState(4, 'error')).toBe('error');
    expect(resolveTranscriptViewState(0, 'ready')).toBe('empty');
    expect(resolveTranscriptViewState(4, 'ready')).toBe('ready');
    expect(source).toContain('title="History couldn\'t load"');
    expect(source).toContain("action={onRetry ? 'Retry' : undefined}");
    expect(source).toContain('role="note" aria-label="Audio unavailable"');
    expect(source).toContain('Audio is not retained for this transcript.');
  });

  it('coalesces polling and bounds explicit retry to one fresh follow-up read', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstRead = new Promise<void>((resolveFirst) => { releaseFirst = resolveFirst; });
    let reads = 0;
    const refresh = createCoalescedRefresh(async () => {
      reads += 1;
      if (reads === 1) await firstRead;
      return reads > 1;
    });

    const polling = refresh();
    const retry = refresh(true);
    expect(retry).toBe(polling);
    expect(refresh(true)).toBe(polling);
    expect(reads).toBe(1);
    releaseFirst?.();
    await expect(retry).resolves.toBe(true);
    expect(reads).toBe(2);
  });

  it('ignores repeated retries after the single follow-up epoch is consumed', async () => {
    let releaseFirst: (() => void) | undefined;
    let releaseSecond: (() => void) | undefined;
    const firstRead = new Promise<void>((resolveFirst) => { releaseFirst = resolveFirst; });
    const secondRead = new Promise<void>((resolveSecond) => { releaseSecond = resolveSecond; });
    let reads = 0;
    const refresh = createCoalescedRefresh(async () => {
      reads += 1;
      if (reads === 1) await firstRead;
      if (reads === 2) await secondRead;
      return true;
    });

    const request = refresh();
    refresh(true);
    releaseFirst?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reads).toBe(2);
    refresh(true);
    refresh(true);
    releaseSecond?.();
    await expect(request).resolves.toBe(true);
    expect(reads).toBe(2);
  });

  it('disposes an in-flight refresh without replaying or reporting success', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolvePending) => { release = resolvePending; });
    let reads = 0;
    const refresh = createCoalescedRefresh(async () => { reads += 1; await pending; return true; });

    const request = refresh();
    refresh.dispose();
    release?.();
    await expect(request).resolves.toBe(false);
    expect(reads).toBe(1);
    await expect(refresh(true)).resolves.toBe(false);
  });

  it('does not hide a failed persisted privacy configuration', () => {
    const source = screen('VoiceIdentityScreen');
    expect(source).toContain("configState, setConfigState");
    expect(source).toContain('Runtime configuration is unavailable.');
    expect(source).toContain('Voice verification configuration is not exposed by canonical IPC');
  });

  it('keeps diagnostics and extensions explicit about unavailable capabilities', () => {
    const diagnostics = screen('CoverageChecklistScreen');
    const extensions = screen('ExtensionsSandboxScreen');
    expect(diagnostics).toContain('no signed update endpoint');
    expect(extensions).toContain('No extensions are presented as available.');
  });
});
