import type { SlashCommand } from "../../../managers/slash/types";
import type { SlashCommandRegistry } from "../../../managers/slash/slash-command-registry";

/** Command availability and execution in one bound editor panel. */
export interface PanelSlashCommandsApi extends Pick<
  SlashCommandRegistry,
  "register" | "delete" | "get"
> {
  /** Shared registry revision; advances when command definitions are registered or removed. */
  readonly revision: number;
  /**
   * Lists commands whose availability predicate accepts this block and panel.
   * @param context - Document-local block ID; the manager supplies its own panel.
   * Omit to list all shared definitions without evaluating availability.
   * @returns Available definitions in registration order without executing them,
   * or all shared definitions when context is omitted.
   * @throws If an availability predicate throws.
   */
  getAll(context?: { blockId: string }): SlashCommand[];
  /**
   * Checks availability again and executes the command using this panel's context.
   * @param id - Registered command ID.
   * @param context - Document-local block ID passed to the predicate and execution callback.
   * @returns After the selected command has run in this occurrence.
   * @throws For an unknown or unavailable command, or when a command callback throws.
   */
  execute(id: string, context: { blockId: string }): void;
  /**
   * Observes registry changes without invoking the callback during registration.
   *
   * @param listener - Called after the shared command definitions change.
   * @returns A disposer that removes this subscription.
   */
  subscribe(listener: () => void): () => void;
}
