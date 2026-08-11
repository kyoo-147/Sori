import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), 'apps/desktop/src', relativePath), 'utf8');

describe('desktop viewport and truthful preview contracts', () => {
  it('exposes stable desktop, tablet, and mobile viewport controls', () => {
    const titleBar = desktopSource('components/DesktopTitleBar.tsx');
    const frame = desktopSource('components/DeviceFrame.tsx');

    expect(titleBar).toContain('aria-label="Desktop preview"');
    expect(titleBar).toContain('aria-label="Tablet preview"');
    expect(titleBar).toContain('aria-label="Mobile preview"');
    expect(titleBar).toContain("setDeviceView('desktop')");
    expect(titleBar).toContain("setDeviceView('tablet')");
    expect(titleBar).toContain("setDeviceView('mobile')");
    expect(frame).toContain("deviceView === 'tablet' ? 'max-w-[768px]' : 'max-w-[375px]'");
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
