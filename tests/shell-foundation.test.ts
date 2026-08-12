import { describe, expect, it, vi } from 'vitest';
import { CommandRegistry } from '../apps/desktop/src/shell/command-registry.js';
import { ExtensionUiRegistry } from '../apps/desktop/src/shell/extension-ui.js';
import { defaultShellLayout, normalizeShellLayout, WorkspaceLayoutModel } from '../apps/desktop/src/shell/layout-model.js';
import { defaultShellPreferences, readShellPreferences, SHELL_PREFERENCES_KEY, writeShellPreferences, type PreferenceStorage } from '../apps/desktop/src/shell/shell-preferences.js';
import { KeyboardShortcutRegistry, normalizeShortcut } from '../apps/desktop/src/shell/shortcut-registry.js';

class MemoryStorage implements PreferenceStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('extensible shell foundation', () => {
  it('registers, searches, gates, and executes commands', async () => {
    const registry = new CommandRegistry();
    const execute = vi.fn();
    registry.register({ id: 'shell.test', title: 'Test command', keywords: ['alpha'], isEnabled: (context) => context.workspaceId === 'default', execute });

    expect(registry.list('alpha')).toHaveLength(1);
    expect(await registry.execute('shell.test', { source: 'programmatic', workspaceId: 'other' })).toBe(false);
    expect(await registry.execute('shell.test', { source: 'programmatic', workspaceId: 'default' })).toBe(true);
    expect(execute).toHaveBeenCalledWith({ source: 'programmatic', workspaceId: 'default' });
    expect(() => registry.register({ id: 'shell.test', title: 'Duplicate', execute: () => undefined })).toThrow('already registered');
  });

  it('normalizes shortcuts and dispatches through the command registry', async () => {
    expect(normalizeShortcut('alt + control + space')).toBe('Ctrl+Alt+Space');
    expect(normalizeShortcut({ key: 'k', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+K');

    const commands = new CommandRegistry();
    const execute = vi.fn();
    commands.register({ id: 'shell.search', title: 'Search', execute });
    const shortcuts = new KeyboardShortcutRegistry();
    shortcuts.register({ id: 'search', commandId: 'shell.search', shortcut: 'Ctrl+K', scope: 'shell' });

    expect(await shortcuts.dispatch({ key: 'k', ctrlKey: true }, commands, { workspaceId: 'default' }, 'shell')).toBe(true);
    expect(execute).toHaveBeenCalledWith({ source: 'keyboard', workspaceId: 'default' });
    expect(() => shortcuts.register({ id: 'other', commandId: 'shell.search', shortcut: 'control+k', scope: 'shell' })).toThrow('already registered');
    expect(() => shortcuts.register({ id: 'panel-search', commandId: 'shell.search', shortcut: 'Ctrl+K', scope: 'panel' })).not.toThrow();
  });

  it('normalizes and mutates panel/workspace layout without accepting corrupt persisted data', () => {
    const model = new WorkspaceLayoutModel(defaultShellLayout);
    expect(model.setPanelVisibility('inspector', true)).toBe(true);
    expect(model.setPanelSize('inspector', 20)).toBe(true);
    expect(model.snapshot().workspaces[0].panels.find((panel) => panel.panelId === 'inspector')).toMatchObject({ visible: true, size: 120 });
    expect(model.movePanel('inspector', 'bottom', 1)).toBe(true);
    expect(normalizeShellLayout({ version: 1, activeWorkspaceId: 'missing', workspaces: [] })).toEqual(defaultShellLayout);
    expect(normalizeShellLayout({ version: 999 })).toEqual(defaultShellLayout);
  });

  it('persists layout, theme, and density as one validated shell preference', () => {
    const storage = new MemoryStorage();
    const preferences = { ...defaultShellPreferences, theme: 'clean-light' as const, density: 'compact' as const };
    writeShellPreferences(preferences, storage);
    expect(storage.getItem(SHELL_PREFERENCES_KEY)).toContain('clean-light');
    expect(readShellPreferences(defaultShellPreferences, storage)).toMatchObject({ theme: 'clean-light', density: 'compact' });

    storage.setItem(SHELL_PREFERENCES_KEY, '{"version":1,"theme":"unsafe","density":"huge","layout":{}}');
    expect(readShellPreferences(defaultShellPreferences, storage)).toMatchObject({ theme: 'dark-obsidian', density: 'comfortable' });
  });

  it('accepts only host-rendered, namespaced extension UI descriptors', () => {
    const registry = new ExtensionUiRegistry();
    const remove = registry.register('ext-slack', [{
      id: 'ext-slack.panel', extensionId: 'ext-slack', kind: 'panel', region: 'sidebar', title: 'Slack', description: 'Safe metadata only',
    }]);
    expect(registry.list('panel')).toHaveLength(1);
    expect(() => registry.register('ext-slack', [{
      id: 'other.panel', extensionId: 'ext-slack', kind: 'panel', region: 'sidebar', title: 'Not namespaced',
    }])).toThrow('namespaced');
    expect(() => registry.register('ext-slack', [{
      id: 'ext-slack.menu', extensionId: 'ext-slack', kind: 'menu', commandId: 'shell.delete-all', title: 'Unsafe command',
    }])).toThrow('namespaced');
    remove();
    expect(registry.list()).toHaveLength(0);
  });
});
