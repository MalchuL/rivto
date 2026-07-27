import type { BlockDefinition, BlockRegistry } from "../blocks";
import type { ClipboardManager, CommandHandler, CommandRegistry, RegisteredCommand, ModeManager, SelectionManager, SlashCommandManager, UndoManager } from "../managers";
import type { CRDTDoc } from "../store/crdt-doc";
import type { DocumentModelImpl } from "../store/document-model";
import type { EditorBlock, EditorBlockInput, EditorBlockLayout, EditorBlockPatch, EditorLink, EditorSnapshot, EditorSnapshotUpdate } from "./model";

/** Local presentation strategy; never persisted in collaborative state. */
export type EditorMode = "block" | "edgeless";

/** UTF-16 text position inside a block. */
export interface EditorPosition {
  /** Stable block containing the position. */
  blockId: string;
  /** UTF-16 offset compatible with DOM Range APIs. */
  offset: number;
}

/** Directed browser-compatible text selection. */
export interface TextSelection {
  /** Discriminant for browser-compatible text selection. */
  type: "text";
  /** Endpoint where the gesture began. */
  anchor: EditorPosition;
  /** Active endpoint; may precede anchor for reverse selection. */
  head: EditorPosition;
}

/** Ordered selection of document blocks. */
export interface BlockSelection {
  /** Discriminant for ordered document-block selection. */
  type: "block";
  /** Selected IDs in visible document order. */
  blockIds: string[];
  /** Block where the selection gesture began. */
  anchorBlockId: string;
  /** Active block where the gesture currently ends. */
  focusBlockId: string;
}

/** Local selection of blocks on the edgeless canvas. */
export interface EdgelessSelection {
  /** Discriminant for canvas object selection. */
  type: "edgeless";
  /** Selected object block IDs. */
  blockIds: string[];
}

/** One independently meaningful selection segment owned by SelectionManager. */
export type EditorSelectionItem = TextSelection | BlockSelection | EdgelessSelection;

/**
 * Ordered local selection state.
 *
 * A list can describe heterogeneous selection—for example, partial text at
 * both ends with complete blocks between them. The order is retained for view
 * behavior; commands that mutate document content normalize it to document
 * order before applying changes.
 */
export type EditorSelection = EditorSelectionItem[];

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
  /** Local owner for an ordered list of text, block, and edgeless selections. */
  readonly selection: SelectionManager;
  /** Framework-neutral structured clipboard operations for this editor. */
  readonly clipboard: ClipboardManager;
  /** Local undo/redo history scoped to document mutations from this runtime. */
  readonly history: UndoManager;
  /** Ordered application commands available to slash-command surfaces. */
  readonly slashCommands: SlashCommandManager;
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
   * Finds one block in the current detached document tree.
   *
   * @param id - Stable block ID.
   * @returns Current block value, or undefined when missing.
   */
  getBlock(id: string): EditorBlock | undefined;

  /** Reads one block's latest persisted collapse state; missing blocks are expanded. */
  getBlockCollapsed(id: string): boolean;

  /**
   * Returns current root blocks as detached values.
   *
   * @returns Ordered root block tree.
   */
  getBlocks(): EditorBlock[];

  /**
   * Finds one link by ID.
   *
   * @param id - Stable link ID.
   * @returns Current link value, or undefined when missing.
   */
  getLink(id: string): EditorLink | undefined;

  /**
   * Returns all current document links as detached values.
   *
   * @returns First-class links stored in the document.
   */
  getLinks(): EditorLink[];

  /** Inserts a block through the built-in `block.insert` command. */
  insertBlock(block: EditorBlockInput, afterId?: string | null): string;

  /** Updates mutable block fields through the built-in `block.update` command. */
  updateBlock(id: string, patch: EditorBlockPatch): void;

  /** Converts a block through `block.type.set` without changing its identity. */
  setBlockType(id: string, type: string): void;

  /** Removes a block through the built-in `block.remove` command. */
  removeBlock(id: string): void;

  /** Deletes the complete active selection through one undoable transaction. */
  deleteSelection(): void;

  /** Atomically appends a source block into a target and returns the text join offset. */
  mergeBlocks(targetId: string, sourceId: string): number;

  /** Moves a block before, after, or inside another block through `block.move`. */
  moveBlock(id: string, targetId: string | null, position?: "before" | "after" | "inside"): void;

  /** Atomically moves sibling block roots through `block.move-many`. */
  moveBlocks(ids: string[], targetId: string | null, position?: "before" | "after" | "inside"): void;

  /** Indents a block through the built-in `block.indent` command. */
  indentBlock(id: string): void;

  /** Outdents a block through the built-in `block.outdent` command. */
  outdentBlock(id: string): void;

  /** Sets one block property through the built-in `block.prop.set` command. */
  setBlockProp(id: string, key: string, value: unknown): void;

  /** Persists one block's collapse state through the atomic batch command. */
  setBlockCollapsed(id: string, collapsed: boolean): void;

  /** Atomically persists one collapse state for one ID or several IDs. */
  setBlocksCollapsed(ids: string | string[], collapsed: boolean): void;

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
