import type { SlashCommandsCapability } from "../../capabilities";
import { RevisionStore } from "../../internal-store";
import type { ReactEditorImpl } from "../../react-editor";
import type { SlashCommand, SlashCommandContext, SlashCommandRevisionListener } from "./types";

/** Owns ordered slash commands for the React runtime. */
export class ReactSlashCommandManager implements SlashCommandsCapability {
  private readonly commands = new Map<string, SlashCommand>();
  private readonly registrations = new Map<string, () => void>();
  private readonly store = new RevisionStore();

  /**
   * @param reactEditor - Complete owning runtime used for registration ownership.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {}

  /** Monotonic command-registry revision. */
  get revision(): number {
    return this.store.revision;
  }

  /**
   * Registers a command owned by the React runtime and active extension.
   *
   * @param command - Complete slash command.
   * @returns Idempotent lifecycle-owned command disposer.
   */
  register(command: SlashCommand): () => void {
    const { extensions } = this.reactEditor;
    extensions.assertActive();
    if (!command.id.trim()) throw new Error("Slash command ID is required");
    if (!command.title.trim()) throw new Error("Slash command title is required");
    if (this.commands.has(command.id)) throw new Error(`Slash command ${command.id} is already registered`);
    this.commands.set(command.id, command);
    this.store.changed();
    let dispose: () => void = () => undefined;
    dispose = extensions.own(() => {
      if (this.registrations.get(command.id) === dispose) {
        this.registrations.delete(command.id);
      }
      if (this.commands.get(command.id) !== command) return;
      this.commands.delete(command.id);
      this.store.changed();
    });
    this.registrations.set(command.id, dispose);
    return dispose;
  }

  /**
   * Deletes a command registered through this React manager.
   *
   * @param id - Stable slash-command identity.
   * @returns True when a React-owned command existed and was disposed.
   */
  delete(id: string): boolean {
    this.reactEditor.extensions.assertActive();
    const dispose = this.registrations.get(id);
    if (!dispose) return false;
    dispose();
    return true;
  }

  /**
   * Returns contextually available commands in declaration order.
   *
   * @param context - Active block context evaluated by availability predicates.
   */
  getAll(context: SlashCommandContext): SlashCommand[] {
    return [...this.commands.values()].filter((command) => command.isAvailable?.(context) !== false);
  }

  /**
   * Executes one available command.
   *
   * @param id - Stable command identity.
   * @param context - Active block context revalidated before execution.
   */
  execute(id: string, context: SlashCommandContext): void {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown slash command ${id}`);
    if (command.isAvailable?.(context) === false) throw new Error(`Slash command ${id} is unavailable`);
    command.execute(context);
  }

  /**
   * @param listener - Callback invoked when the registry revision changes.
   * @returns Subscription disposer.
   */
  subscribe(listener: SlashCommandRevisionListener): () => void {
    return this.store.subscribe(listener);
  }

  /** Releases registry listeners after extension-owned commands are disposed. */
  destroy(): void {
    this.commands.clear();
    this.registrations.clear();
    this.store.clear();
  }
}
