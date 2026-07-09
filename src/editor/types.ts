import type { BlockDefinition, BlockRegistry } from "../blocks";
import type { CommandHandler, CommandRegistry, RegisteredCommand, ModeManager, UndoManager } from "../managers";
import type { CRDTDoc } from "../store/crdt-doc";
import type { DocumentModelImpl } from "../store/document-model";
import type { EditorBlockInput, EditorBlockLayout, EditorBlockPatch, EditorLink, EditorSnapshot, EditorSnapshotUpdate } from "./model";

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
  /** Local undo/redo history scoped to document mutations from this runtime. */
  readonly history: UndoManager;
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

  /** Inserts a block through the built-in `block.insert` command. */
  insertBlock(block: EditorBlockInput, afterId?: string | null): string;

  /** Updates mutable block fields through the built-in `block.update` command. */
  updateBlock(id: string, patch: EditorBlockPatch): void;

  /** Removes a block through the built-in `block.remove` command. */
  removeBlock(id: string): void;

  /** Moves a block through the built-in `block.move` command. */
  moveBlock(id: string, afterId: string | null): void;

  /** Indents a block through the built-in `block.indent` command. */
  indentBlock(id: string): void;

  /** Outdents a block through the built-in `block.outdent` command. */
  outdentBlock(id: string): void;

  /** Sets one block property through the built-in `block.prop.set` command. */
  setBlockProp(id: string, key: string, value: unknown): void;

  /** Sets one block plugin-data namespace through `block.pluginData.set`. */
  setBlockPluginData(id: string, pluginId: string, value: unknown): void;

  /** Patches block layout through the built-in `block.layout.set` command. */
  setBlockLayout(id: string, layout: Partial<EditorBlockLayout>): void;

  /** Creates or replaces a link through the built-in `link.create` command. */
  createLink(link: EditorLink): void;

  /** Removes a link through the built-in `link.remove` command. */
  removeLink(id: string): void;

  /** Loads persisted document state through the built-in `document.load` command. */
  load(snapshot: EditorSnapshotUpdate): void;

  /** Dumps the current document snapshot for persistence. */
  dump(): EditorSnapshot;

  /** Reverts the latest local document operation through `history.undo`. */
  undo(): void;

  /** Reapplies the latest undone document operation through `history.redo`. */
  redo(): void;

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
