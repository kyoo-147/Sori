import { CommandRegistry } from './command-registry.js';
import { ExtensionUiRegistry } from './extension-ui.js';
import { WorkspaceLayoutModel } from './layout-model.js';
import { KeyboardShortcutRegistry } from './shortcut-registry.js';
import type { ShellPreferences } from './shell-preferences.js';

export interface ShellFoundation {
  commands: CommandRegistry;
  shortcuts: KeyboardShortcutRegistry;
  layout: WorkspaceLayoutModel;
  extensionUi: ExtensionUiRegistry;
}

export function createShellFoundation(preferences: ShellPreferences): ShellFoundation {
  return {
    commands: new CommandRegistry(),
    shortcuts: new KeyboardShortcutRegistry(),
    layout: new WorkspaceLayoutModel(preferences.layout),
    extensionUi: new ExtensionUiRegistry(),
  };
}
