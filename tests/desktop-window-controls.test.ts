import { describe, expect, it } from 'vitest';
import { performWindowAction, type WindowAction } from '../apps/desktop/src/window-actions.js';
import { readFileSync } from 'node:fs';

const titlebarSource = readFileSync('apps/desktop/src/components/DesktopTitleBar.tsx', 'utf8');
const nativeSource = readFileSync('apps/desktop/src-tauri/src/lib.rs', 'utf8');
const nativeE2eSource = readFileSync('scripts/e2e-desktop-native.ts', 'utf8');
const tauriConfig = readFileSync('apps/desktop/src-tauri/tauri.conf.json', 'utf8');

const actions: WindowAction[] = ['minimize', 'maximize', 'restore', 'toggle-maximize', 'close', 'drag'];

describe('desktop window controls', () => {
  it.each(actions)('forwards %s to the native window boundary', async (action) => {
    const calls: string[] = [];
    const api = {
      minimize: async () => void calls.push('minimize'),
      maximize: async () => void calls.push('maximize'),
      restore: async () => void calls.push('restore'),
      toggleMaximize: async () => void calls.push('toggle-maximize'),
      close: async () => void calls.push('close'),
      startDragging: async () => void calls.push('drag'),
    };

    await performWindowAction(api, action);

    expect(calls).toEqual([action]);
  });

  it('keeps controls keyboard accessible and excludes them from titlebar drag', () => {
    expect(titlebarSource).toContain('role="toolbar"');
    expect(titlebarSource).toContain('aria-label="Minimize window"');
    expect(titlebarSource).toContain('aria-label={isMaximized ? \'Restore window\' : \'Maximize window\'}');
    expect(titlebarSource).toContain('aria-label="Close window"');
    expect(titlebarSource).toContain('data-tauri-drag-region="false"');
    expect(titlebarSource).toContain('onDoubleClick={handleTitlebarDoubleClick}');
    expect(titlebarSource).toContain("runWindowAction('drag')");
  });

  it('registers the native command boundary for every window action', () => {
    for (const command of [
      'window_minimize',
      'window_maximize',
      'window_restore',
      'window_toggle_maximize',
      'window_close',
      'window_start_dragging',
    ]) {
      expect(nativeSource).toContain(command);
    }
  });
  it('keeps native automation foregrounded and never treats browser preview as native proof', () => {
    expect(nativeE2eSource).toContain('GetForegroundWindow');
    expect(nativeE2eSource).toContain('GetWindowThreadProcessId');
    expect(nativeE2eSource).toContain('NativeEnvironmentSkip');
    expect(nativeE2eSource).toContain('Browser preview or an overlay screenshot is not native evidence');
    expect(tauriConfig).toContain('"alwaysOnTop": false');
  });
});
