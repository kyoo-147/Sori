import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const screen = (name: string) => readFileSync(resolve(process.cwd(), `apps/desktop/src/components/screens/${name}.tsx`), 'utf8');

describe('history and privacy screen truth boundaries', () => {
  it('exposes transcript loading, retry, and unavailable audio semantics', () => {
    const source = screen('TranscriptsScreen');
    expect(source).toContain("loadState === 'loading'");
    expect(source).toContain('title="History unavailable"');
    expect(source).toContain('detail="Local history could not be read."');
    expect(source).toContain('role="note" aria-label="Audio unavailable"');
    expect(source).toContain('Audio is not retained for this transcript.');
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
    expect(diagnostics).toContain('UNVERIFIED or unavailable');
    expect(diagnostics).toContain('no signed update endpoint');
    expect(extensions).toContain('Install, account authentication, and command execution are Unavailable.');
    expect(extensions).toContain('title="Extension installation is not wired"');
  });
});
