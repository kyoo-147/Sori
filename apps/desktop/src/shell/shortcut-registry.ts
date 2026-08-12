import type { CommandContext, CommandRegistry } from './command-registry.js';

export type ShortcutScope = 'global' | 'shell' | 'workspace' | 'panel';

export interface ShortcutInput {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

export interface KeyboardShortcut {
  id: string;
  commandId: string;
  shortcut: string;
  scope?: ShortcutScope;
  description?: string;
}

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
const MODIFIER_ALIASES: Record<string, (typeof MODIFIER_ORDER)[number]> = {
  ctrl: 'Ctrl', control: 'Ctrl', cmd: 'Meta', command: 'Meta', meta: 'Meta',
  alt: 'Alt', option: 'Alt', shift: 'Shift',
};
const KEY_ALIASES: Record<string, string> = {
  esc: 'Escape', return: 'Enter', spacebar: 'Space', ' ': 'Space', arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
};

function normalizeKey(key: string): string {
  const trimmed = key === ' ' ? key : key.trim();
  if (!trimmed) throw new Error('Shortcut key must not be empty');
  const alias = KEY_ALIASES[trimmed.toLocaleLowerCase()];
  if (alias) return alias;
  if (trimmed.length === 1) return trimmed.toLocaleUpperCase();
  return trimmed[0].toLocaleUpperCase() + trimmed.slice(1);
}

export function normalizeShortcut(input: string | ShortcutInput): string {
  if (typeof input === 'string') {
    const parts = input.split('+').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) throw new Error('Shortcut must not be empty');
    const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>();
    let key: string | undefined;
    for (const part of parts) {
      const modifier = MODIFIER_ALIASES[part.toLocaleLowerCase()];
      if (modifier) modifiers.add(modifier);
      else if (key) throw new Error(`Shortcut has more than one key: ${input}`);
      else key = normalizeKey(part);
    }
    if (!key) throw new Error(`Shortcut has no key: ${input}`);
    return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join('+');
  }

  const modifiers = MODIFIER_ORDER.filter((modifier) => {
    if (modifier === 'Ctrl') return input.ctrlKey;
    if (modifier === 'Alt') return input.altKey;
    if (modifier === 'Shift') return input.shiftKey;
    return input.metaKey;
  });
  return [...modifiers, normalizeKey(input.key)].join('+');
}

export class KeyboardShortcutRegistry {
  private readonly shortcuts = new Map<string, KeyboardShortcut>();

  register(shortcut: KeyboardShortcut): () => void {
    if (!shortcut.id.trim()) throw new Error('Shortcut id must not be empty');
    if (!shortcut.commandId.trim()) throw new Error(`Shortcut ${shortcut.id} must reference a command`);
    const normalized = normalizeShortcut(shortcut.shortcut);
    const scope = shortcut.scope ?? 'shell';
    const conflict = this.list().find((candidate) =>
      candidate.shortcut === normalized && (candidate.scope ?? 'shell') === scope,
    );
    if (conflict) throw new Error(`Shortcut already registered in ${scope}: ${normalized}`);
    if (this.shortcuts.has(shortcut.id)) throw new Error(`Shortcut already registered: ${shortcut.id}`);

    this.shortcuts.set(shortcut.id, { ...shortcut, shortcut: normalized, scope });
    return () => this.unregister(shortcut.id);
  }

  registerMany(shortcuts: readonly KeyboardShortcut[]): () => void {
    const unregister = shortcuts.map((shortcut) => this.register(shortcut));
    return () => unregister.reverse().forEach((remove) => remove());
  }

  unregister(id: string): boolean {
    return this.shortcuts.delete(id);
  }

  list(): KeyboardShortcut[] {
    return [...this.shortcuts.values()].map((shortcut) => ({ ...shortcut }));
  }

  resolve(input: string | ShortcutInput, scope?: ShortcutScope): KeyboardShortcut | undefined {
    const normalized = normalizeShortcut(input);
    return this.list().find((shortcut) => shortcut.shortcut === normalized && (!scope || shortcut.scope === scope));
  }

  async dispatch(
    input: string | ShortcutInput,
    commands: CommandRegistry,
    context: Omit<CommandContext, 'source'> = {},
    scope?: ShortcutScope,
  ): Promise<boolean> {
    const shortcut = this.resolve(input, scope);
    return shortcut ? commands.execute(shortcut.commandId, { ...context, source: 'keyboard' }) : false;
  }

  clear(): void {
    this.shortcuts.clear();
  }
}
