/** Block-local context supplied when listing or running a slash command. */
export interface SlashCommandContext {
  /** Stable ID of the block containing the command trigger. */
  readonly blockId: string;
}

/** One application-provided action available to a slash-command surface. */
export interface SlashCommand {
  /** Stable registration and execution ID. */
  readonly id: string;
  /** Human-readable menu label. */
  readonly title: string;
  /** Optional menu section label. */
  readonly group?: string;
  /** Additional terms considered by a UI-owned search implementation. */
  readonly keywords?: readonly string[];
  /** Hides commands that are not meaningful for the current block. */
  readonly isAvailable?: (context: SlashCommandContext) => boolean;
  /** Performs the command for the current block. */
  readonly execute: (context: SlashCommandContext) => void;
}

/**
 * Owns ordered slash-command registrations without owning their presentation.
 *
 * Applications register commands with closures over their editor or services.
 * React menus, fuzzy matching, positioning, and keyboard policy stay outside
 * this manager so the same command set can be used by another view framework.
 */
export class SlashCommandManager {
  private readonly commands = new Map<string, SlashCommand>();
  private readonly listeners = new Set<() => void>();
  private currentRevision = 0;

  /** Monotonic snapshot used by reactive menu implementations. */
  get revision(): number { return this.currentRevision; }

  /**
   * Registers one command until its returned disposer is called.
   *
   * @throws If the ID/title is empty or the ID is already registered.
   */
  register(command: SlashCommand): () => void {
    if (!command.id.trim()) throw new Error("Slash command ID is required");
    if (!command.title.trim()) throw new Error("Slash command title is required");
    if (this.commands.has(command.id)) throw new Error(`Slash command ${command.id} is already registered`);
    this.commands.set(command.id, command);
    this.changed();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (this.commands.get(command.id) !== command) return;
      this.commands.delete(command.id);
      this.changed();
    };
  }

  /** Returns available commands in declaration order as a detached array. */
  getAll(context: SlashCommandContext): SlashCommand[] {
    return [...this.commands.values()].filter((command) => command.isAvailable?.(context) !== false);
  }

  /**
   * Executes one available command.
   *
   * @throws If the command is missing or unavailable for the supplied block.
   */
  execute(id: string, context: SlashCommandContext): void {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown slash command ${id}`);
    if (command.isAvailable?.(context) === false) throw new Error(`Slash command ${id} is unavailable`);
    command.execute(context);
  }

  /** Subscribes to registration changes and returns automatic cleanup. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Removes all registrations and listeners during editor destruction. */
  clear(): void {
    if (this.commands.size) {
      this.commands.clear();
      this.changed();
    }
    this.listeners.clear();
  }

  /** Publishes a stable listener snapshot so disposal during notification is safe. */
  private changed(): void {
    this.currentRevision += 1;
    [...this.listeners].forEach((listener) => listener());
  }
}
