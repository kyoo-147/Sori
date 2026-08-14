import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('desktop preview truth contracts', () => {
  it('does not seed preview models, history, or benchmark results', () => {
    const initialData = source('apps/desktop/src/data/initialData.ts');
    expect(initialData).not.toContain('initialModels');
    expect(initialData).not.toContain('initialHistory');
    expect(initialData).not.toContain('initialBenchmarkResults');
  });

  it('keeps browser capture and focused target boundaries explicit', () => {
    const overview = source('apps/desktop/src/components/screens/OverviewScreen.tsx');
    const edit = source('apps/desktop/src/components/screens/VoiceEditScreen.tsx');
    const titlebar = source('apps/desktop/src/components/DesktopTitleBar.tsx');
    expect(overview).toContain('disabled={runtimeSource === \'unavailable\' || runtimeSource === \'mock\'}');
    expect(overview).toContain('target focus and injection remain UNVERIFIED');
    expect(edit).toContain("target_identity: 'browser:selection'");
    expect(edit).toContain('Replace unavailable');
    expect(titlebar).toContain('titlebarCaptureDisabled(runtimeSource)');
    expect(titlebar).toContain('Dictation unavailable');
  });

  it('removes fabricated tray metrics and disables unwired profile actions', () => {
    const tray = source('apps/desktop/src/components/TrayQuickControls.tsx');
    expect(tray).toContain('UNVERIFIED');
    expect(tray).not.toContain('65ms (Local CUDA)');
    expect(tray).toContain('disabled');
    expect(tray).toContain('Needs Wiring');
  });
});
