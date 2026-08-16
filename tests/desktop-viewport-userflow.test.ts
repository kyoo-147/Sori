import { applySidebarLiveWidth } from '../apps/desktop/src/App.js';
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
    expect(sidebar).toContain('max-md:top-10');
  });

  it('keeps sidebar resize owned by one pointer through the pre-pointerup commit', () => {
    const app = desktopSource('App.tsx');
    expect(app).toContain('const pointerId = event.pointerId;');
    expect(app).toContain('moveEvent.pointerId !== pointerId || finished');
    expect(app).toContain("window.addEventListener('pointermove', move");
    expect(app).toContain("window.addEventListener('pointerup', stop)");
    expect(app).toContain("window.addEventListener('pointercancel', stop)");
    expect(app).toContain("owner.addEventListener('lostpointercapture', stop)");
    expect(app).toContain('window.cancelAnimationFrame(resizeFrame.current)');
    expect(app).toContain('setSidebarWidth(resizeWidth.current);');
    expect(app).toContain('applyLiveWidth();');
    expect(app).toContain('applyLiveWidth();');
    expect(app).toContain('shellRef.current');
    expect(app).not.toContain("document.documentElement.style.setProperty('--sori-sidebar-width-live'");
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
    expect(diagnostics).toContain("name: 'updater'");
    expect(diagnostics).toContain('desktop updates');
    expect(diagnostics).toContain('no signed update endpoint or updater plugin is shipped');
  });

  it('keeps first-run setup truthful and connected to canonical runtime calls', () => {
    const onboarding = desktopSource('components/screens/FirstRunOnboardingScreen.tsx');
    const runtime = desktopSource('runtime-client.ts');
    expect(onboarding).toContain('runtimeClient.dictationStart()');
    expect(onboarding).toContain('runtimeClient.dictationStop()');
    expect(onboarding).toContain('UNVERIFIED');
    expect(onboarding).not.toContain('successfully injected text');
    expect(runtime).toContain("this.control('dictation_start')");
    expect(runtime).toContain("this.call('dictation_stop'");
  });
  it('writes the live width to the shell ref before pointerup commits React state', () => {
    const values = new Map<string, string>();
    const sequence: string[] = [];
    const shell = { style: { setProperty: (name: string, value: string) => { values.set(name, value); sequence.push('shell-style'); } } } as unknown as Pick<HTMLElement, 'style'>;
    applySidebarLiveWidth(shell, 312);
    sequence.push('pointerup');
    expect(values.get('--sori-sidebar-width-live')).toBe('312px');
    expect(sequence).toEqual(['shell-style', 'pointerup']);
  });
});
