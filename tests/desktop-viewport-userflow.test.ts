import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), 'apps/desktop/src', relativePath), 'utf8');

describe('desktop shell and truthful preview contracts', () => {
  it('uses one native-window shell without production viewport simulation', () => {
    const app = desktopSource('App.tsx');
    const titleBar = desktopSource('components/DesktopTitleBar.tsx');
    const sidebar = desktopSource('components/DesktopSidebar.tsx');

    expect(app).toContain('sori-app-shell');
    expect(app).toContain('sori-app-body');
    expect(app).toContain('sori-main-content');
    expect(app).not.toContain('DeviceFrame');
    expect(app).not.toContain('deviceView');
    expect(titleBar).not.toContain('Preview viewport');
    expect(titleBar).not.toContain('setDeviceView');
    expect(titleBar).not.toContain('Tablet preview');
    expect(titleBar).not.toContain('Mobile preview');
    expect(sidebar).toContain('max-md:top-12');
  });

  it('keeps the primary navigation labels explicit and stable', () => {
    const sidebar = desktopSource('components/DesktopSidebar.tsx');
    expect(sidebar).toContain("label: 'Home'");
    expect(sidebar).toContain("label: 'Transcripts'");
    expect(sidebar).toContain("label: 'Vocabulary'");
    expect(sidebar).toContain("label: 'Voice Edit'");
    expect(sidebar).toContain("label: 'Models & Routing'");
    expect(sidebar).toContain("label: 'Benchmarks'");
  });

  it('does not claim unavailable diagnostic actions succeeded', () => {
    const diagnostics = desktopSource('components/screens/CoverageChecklistScreen.tsx');
    expect(diagnostics).toContain('Text injection is not wired in this preview; no payload was delivered.');
    expect(diagnostics).toContain('Daemon restart is not wired in this preview.');
    expect(diagnostics).toContain('Restart Daemon (`sorid`) — not wired');
    expect(diagnostics).not.toContain('Text injection payload successfully delivered');
  });
});
