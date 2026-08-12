export type CommandSource = 'keyboard' | 'menu' | 'extension' | 'programmatic';

export interface CommandContext {
  source: CommandSource;
  workspaceId?: string;
  panelId?: string;
  extensionId?: string;
  [key: string]: unknown;
}

export interface ShellCommand {
  id: string;
  title: string;
  description?: string;
  category?: string;
  keywords?: string[];
  isEnabled?: (context: CommandContext) => boolean;
  execute: (context: CommandContext) => void | Promise<void>;
}

export class CommandRegistry {
  private readonly commands = new Map<string, ShellCommand>();

  register(command: ShellCommand): () => void {
    if (!command.id.trim()) throw new Error('Command id must not be empty');
    if (!command.title.trim()) throw new Error(`Command ${command.id} must have a title`);
    if (typeof command.execute !== 'function') throw new Error(`Command ${command.id} must have an execute function`);
    if (this.commands.has(command.id)) throw new Error(`Command already registered: ${command.id}`);

    this.commands.set(command.id, { ...command, keywords: command.keywords ? [...command.keywords] : undefined });
    return () => this.unregister(command.id);
  }

  registerMany(commands: readonly ShellCommand[]): () => void {
    const unregister = commands.map((command) => this.register(command));
    return () => unregister.reverse().forEach((remove) => remove());
  }

  unregister(id: string): boolean {
    return this.commands.delete(id);
  }

  get(id: string): ShellCommand | undefined {
    return this.commands.get(id);
  }

  list(query?: string): ShellCommand[] {
    const normalizedQuery = query?.trim().toLocaleLowerCase();
    return [...this.commands.values()]
      .filter((command) => {
        if (!normalizedQuery) return true;
        return [command.id, command.title, command.description, ...(command.keywords ?? [])]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  async execute(id: string, context: CommandContext = { source: 'programmatic' }): Promise<boolean> {
    const command = this.commands.get(id);
    if (!command) return false;
    if (command.isEnabled && !command.isEnabled(context)) return false;
    await command.execute(context);
    return true;
  }

  clear(): void {
    this.commands.clear();
  }
}
