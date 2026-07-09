import type { BlockDefinition, BlockRegistry } from "../blocks";
import type { CommandHandler, CommandRegistry, RegisteredCommand, ModeManager } from "../managers";
import type { CRDTDoc } from "../store/crdt-doc";
import type { DocumentModelImpl } from "../store/document-model";

/** Local presentation strategy; never persisted in collaborative state. */
export type EditorMode = "block" | "edgeless";

export interface CreateRivtoEditorOptions {
  document?: CRDTDoc;
  mode?: EditorMode;
}

/**
 * Public editor surface exposed to UI and integrations.
 *
 * The API is intentionally small while the editor is being rebuilt. It owns
 * block definitions, commands, editor mode, and a revision counter that
 * subscribers can use to react to runtime changes.
 */
export interface RivtoEditorApi {
  /** Canonical collaborative document and persistence boundary. */
  readonly document: DocumentModelImpl;
  /** Native block definition registry. */
  readonly blocks: BlockRegistry;
  /** Single action entry point for UI, integrations, and later document mutations. */
  readonly commands: CommandRegistry;
  /** Local block/edgeless mode owner. */
  readonly mode: ModeManager;
  /** Monotonic view invalidation snapshot. */
  readonly revision: number;

  /**
   * Subscribes to runtime changes that increment `revision`.
   *
   * @param listener - Callback called after blocks or mode change.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void;

  /**
   * Registers one command on the runtime command registry.
   *
   * @param name - Unique, non-empty command ID.
   * @param handler - Runtime command implementation.
   * @returns Ownership handle for this exact registration.
   */
  register(name: string, handler: CommandHandler): RegisteredCommand;

  /**
   * Executes a registered command.
   *
   * @param name - Command ID to execute.
   * @param payload - Optional runtime payload passed to the handler.
   * @returns The command handler result.
   */
  execute(name: string, payload?: unknown): unknown;

  /**
   * Removes a command by name.
   *
   * @param name - Command ID to remove.
   */
  removeCommand(name: string): void;

  /**
   * Adds a block definition to the runtime registry.
   *
   * @param definition - Definition for a unique native block type.
   * @returns Idempotent function that removes this definition.
   */
  defineBlock(definition: BlockDefinition): () => void;

  /** Releases runtime-owned resources. */
  destroy(): void;
}
