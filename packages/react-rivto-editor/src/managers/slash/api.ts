import type { SlashCommand } from "./types";

/** Command availability and execution in one bound editor panel. */
export interface PanelSlashCommandsApi {
  /** Shared registry revision; advances when command definitions are registered or removed. */
  readonly revision: number;
  /**
   * Lists commands whose availability predicate accepts this block and panel.
   * @param context - Document-local block ID; the manager supplies its own panel.
   * @returns Available definitions in registration order without executing them.
   * @throws If an availability predicate throws.
   */
  getAll(context: { blockId: string }): SlashCommand[];
  /**
   * Checks availability again and executes the command using this panel's context.
   * @param id - Registered command ID.
   * @param context - Document-local block ID passed to the predicate and execution callback.
   * @throws For an unknown or unavailable command, or when a command callback throws.
   */
  execute(id: string, context: { blockId: string }): void;
  /** Observes registry changes without an immediate callback; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
