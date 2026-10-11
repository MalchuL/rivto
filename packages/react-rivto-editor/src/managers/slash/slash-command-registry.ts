import { RevisionStore } from "../../internal-store";
import type { RegistrationOwner } from "../extensions/types";
import type { SlashCommand, SlashCommandRevisionListener } from "./types";

/** Owns ordered slash commands for the React runtime. */
export class SlashCommandRegistry {
  private readonly commands = new Map<string, SlashCommand>();
  private readonly registrations = new Map<string, () => void>();
  private readonly store = new RevisionStore();

  /**
   * @param owner - Extension lifecycle owning registered contributions.
   */
  constructor(private readonly owner: RegistrationOwner) {}

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
    const extensions = this.owner;
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
    this.owner.assertActive();
    const dispose = this.registrations.get(id);
    if (!dispose) return false;
    dispose();
    return true;
  }

  /** Returns registered definitions in declaration order; availability is view-specific. */
  getAll(): SlashCommand[] { return [...this.commands.values()]; }

  /** Returns the definition with this ID, or undefined when it is not registered. */
  get(id: string): SlashCommand | undefined { return this.commands.get(id); }

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
