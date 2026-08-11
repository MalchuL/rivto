import type {
  SlashCommand,
  SlashCommandContext,
} from "@chulane/rivto";
import type { SlashCommandsCapability } from "../../capabilities";
import type { ReactEditorImpl } from "../../react-editor";
import type { SlashCommandRevisionListener } from "./types";

/**
 * Adds React-runtime ownership to the core slash-command registry.
 *
 * Commands remain stored exclusively by the core manager. Popup state, search,
 * caret geometry, and keyboard navigation remain presentation-extension concerns.
 */
export class ReactSlashCommandManager implements SlashCommandsCapability {
  private readonly registrations = new Map<string, () => void>();

  /**
   * Creates a lifecycle-aware facade over the core slash manager.
   *
   * @param reactEditor - Complete owning runtime. Core slash storage and
   * registration ownership are resolved lazily from it.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {}

  /** Monotonic core command-registry revision. */
  get revision(): number {
    return this.reactEditor.editor.slashCommands.revision;
  }

  /**
   * Registers a core command owned by the React runtime and active extension.
   *
   * @param command - Complete command stored by the core slash manager.
   * @returns Idempotent lifecycle-owned command disposer.
   */
  register(command: SlashCommand): () => void {
    const { editor, extensions } = this.reactEditor;
    extensions.assertActive();
    const releaseCore = editor.slashCommands.register(command);
    let dispose: () => void = () => undefined;
    dispose = extensions.own(() => {
      if (this.registrations.get(command.id) === dispose) {
        this.registrations.delete(command.id);
      }
      releaseCore();
    });
    this.registrations.set(command.id, dispose);
    return dispose;
  }

  /**
   * Deletes a command registered through this React manager.
   *
   * Commands registered directly on the core editor are intentionally outside
   * this manager's ownership and cannot be deleted here.
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
   * Returns contextually available commands in core declaration order.
   *
   * @param context - Active block context evaluated by availability predicates.
   */
  getAll(context: SlashCommandContext): SlashCommand[] {
    return this.reactEditor.editor.slashCommands.getAll(context);
  }

  /**
   * Executes one available command through the shared core registry.
   *
   * @param id - Stable command identity.
   * @param context - Active block context revalidated before execution.
   */
  execute(id: string, context: SlashCommandContext): void {
    this.reactEditor.editor.slashCommands.execute(id, context);
  }

  /**
   * Subscribes directly to shared core slash-command changes.
   *
   * @param listener - Callback invoked when the core registry revision changes.
   * @returns Core subscription disposer.
   */
  subscribe(listener: SlashCommandRevisionListener): () => void {
    return this.reactEditor.editor.slashCommands.subscribe(listener);
  }
}
