import type { BlockDefinition, BlockRegistry } from "../blocks";
import type { ClipboardManager, CommandHandler, CommandRegistry, RegisteredCommand, ModeManager, SelectionManager, SlashCommandManager, UndoManager } from "../managers";
import type { CRDTDoc } from "../store/crdt-doc";
import type { DocumentModel } from "../store/document-model";
import type { EditorBlock, EditorBlockInput, EditorBlockLayout, EditorBlockPatch, EditorBlockUpdate, EditorLink, EditorSnapshot, EditorSnapshotUpdate } from "./model";

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

/**
 * Ordered selection of document blocks.
 *
 * `blockIds` are always stored in visible document order and may be
 * non-contiguous (Ctrl/Cmd+click toggle). Contiguous ranges from Shift+Arrow
 * still use the same shape, with every ID between the endpoints present.
 *
 * `anchorBlockId` / `focusBlockId` record gesture direction, not document
 * order. Both must be members of `blockIds`. For a toggle multi-select,
 * anchor is the first click that remains selected and focus is the last block
 * toggled on — so click order `1 → 10 → 3` and `3 → 10 → 1` share
 * `blockIds: ["1","3","10"]` but differ in anchor/focus.
 */
export interface BlockSelection {
  /** Discriminant for ordered document-block selection. */
  type: "block";
  /**
   * Selected IDs in visible document order.
   * Gaps are allowed; missing IDs between the first and last selected block
   * are not invented.
   */
  blockIds: string[];
  /**
   * Block where the multi-select / range gesture began.
   * Sticky across Ctrl/Cmd+click toggles while it remains selected.
   */
  anchorBlockId: string;
  /**
   * Active end of the gesture (last block toggled on, or the moving
   * Shift+Arrow endpoint). May precede `anchorBlockId` in document order.
   */
  focusBlockId: string;
}

/** One independently meaningful selection segment owned by SelectionManager. */
export type EditorSelectionItem = TextSelection | BlockSelection;

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
  readonly document: DocumentModel;
  /** Native block definition registry. */
  readonly blocks: BlockRegistry;
  /** Single action entry point for UI, integrations, and later document mutations. */
  readonly commands: CommandRegistry;
  /** Local block/edgeless mode owner. */
  readonly mode: ModeManager;
  /** Local owner for an ordered list of text and whole-block selections. */
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
   * Groups synchronous editor mutations into one collaborative update and undo step.
   *
   * Nested batches join the active outer batch. Subscribers receive no
   * intermediate document revision, and all captured mutations share one
   * history item.
   *
   * Batching does not provide rollback: writes completed before an exception
   * remain applied.
   *
   * @param operation - Synchronous editor work to execute inside the batch.
   * @returns The value returned by `operation`.
   * @throws The original error when `operation` fails.
   */
  batchUpdates<Result>(operation: () => Result): Result;

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

  /**
   * Returns current root blocks as detached values.
   *
   * @returns Ordered root block tree.
   */
  getBlocks(): EditorBlock[];

  /**
   * Reads top-level block IDs without materializing their subtrees.
   *
   * @returns Root IDs in collaborative order.
   */
  getRootIds(): string[];

  /**
   * Reads one block's direct child IDs.
   *
   * @param id - Parent block ID.
   * @returns Child IDs in collaborative order, or an empty list when absent.
   */
  getChildIds(id: string): string[];

  /**
   * Resolves the current structural parent of one placed block.
   *
   * @param id - Block ID to locate.
   * @returns Parent ID, null for a root, or undefined when absent.
   */
  getParentId(id: string): string | null | undefined;

  /**
   * Reads IDs currently visible in the page outline.
   *
   * @returns Collapse-aware IDs in depth-first document order.
   */
  getVisibleBlockIds(): string[];

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

  /**
   * Inserts a validated block through the built-in command path.
   *
   * @param block - Block type and initial persisted values.
   * @param afterId - Sibling to follow, null to prepend, or omitted to append.
   * @returns Stable ID assigned to the new block.
   */
  insertBlock(block: EditorBlockInput, afterId?: string | null): string;

  /**
   * Patches supplied mutable fields on one block.
   *
   * @param id - Block ID to update.
   * @param patch - Mutable block fields to apply.
   */
  updateBlock(id: string, patch: EditorBlockPatch): void;

  /**
   * Applies several identified block patches as one command and undo item.
   *
   * @param updates - Ordered block IDs and patches to apply.
   */
  updateBlocks(updates: readonly EditorBlockUpdate[]): void;

  /**
   * Clears one block while preserving its identity and block-owned metadata.
   *
   * Content becomes empty and every descendant is removed recursively. Type,
   * properties, plugin data, layout, and collapse state remain unchanged.
   *
   * @param id - Block ID to retain and clear.
   */
  clearBlock(id: string): void;

  /**
   * Converts a block to another registered type without changing its ID.
   *
   * @param id - Block ID to convert.
   * @param type - Registered destination block type.
   */
  setBlockType(id: string, type: string): void;

  /**
   * Removes a block subtree or its active structural selection.
   *
   * @param id - Block ID anchoring the removal.
   */
  removeBlock(id: string): void;

  /**
   * Deletes the complete active selection as one undoable operation.
   */
  deleteSelection(): void;

  /**
   * Appends a source block's content and children into a surviving target.
   *
   * @param targetId - Block that remains after the merge.
   * @param sourceId - Block transferred and removed by the merge.
   * @returns Target content offset where source content begins.
   */
  mergeBlocks(targetId: string, sourceId: string): number;

  /**
   * Moves one block relative to a destination block.
   *
   * @param id - Block ID to move.
   * @param targetId - Destination block, or null for the sibling-list start.
   * @param position - Placement relative to the destination; defaults to after.
   */
  moveBlock(id: string, targetId: string | null, position?: "before" | "after" | "inside"): void;

  /**
   * Moves several sibling subtree roots as one command and undo item.
   *
   * @param ids - Ordered block IDs to move together.
   * @param targetId - Destination block, or null for the sibling-list start.
   * @param position - Placement relative to the destination; defaults to after.
   */
  moveBlocks(ids: string[], targetId: string | null, position?: "before" | "after" | "inside"): void;

  /**
   * Nests a block or eligible structural selection under a previous sibling.
   *
   * @param id - Block ID anchoring the indent operation.
   */
  indentBlock(id: string): void;

  /**
   * Moves a block or eligible structural selection out of its parent.
   *
   * @param id - Block ID anchoring the outdent operation.
   */
  outdentBlock(id: string): void;

  /**
   * Sets or removes one validated native block property.
   *
   * @param id - Owning block ID.
   * @param key - Native property key.
   * @param value - New value, or undefined to remove the property.
   */
  setBlockProp(id: string, key: string, value: unknown): void;

  /**
   * Sets or removes one block plugin-data namespace.
   *
   * @param id - Owning block ID.
   * @param pluginId - Stable plugin namespace.
   * @param value - New value, or undefined to remove the namespace.
   */
  setBlockPluginData(id: string, pluginId: string, value: unknown): void;

  /**
   * Patches supplied collaborative geometry fields on one block.
   *
   * @param id - Block ID whose layout should change.
   * @param layout - Partial x, y, size, or stacking values.
   */
  setBlockLayout(id: string, layout: Partial<EditorBlockLayout>): void;

  /**
   * Creates or replaces a first-class link.
   *
   * @param link - Complete persisted link value.
   */
  createLink(link: EditorLink): void;

  /**
   * Removes one first-class link by ID.
   *
   * @param id - Persisted link ID to remove.
   */
  removeLink(id: string): void;

  /**
   * Replaces supplied document sections and clears previous local history.
   *
   * @param snapshot - Snapshot v4 sections to validate and load.
   */
  load(snapshot: EditorSnapshotUpdate): void;

  /**
   * Materializes the complete portable document state.
   *
   * @returns Detached snapshot v4 suitable for persistence or transfer.
   */
  dump(): EditorSnapshot;

  /**
   * Reverts the latest captured local document operation.
   */
  undo(): void;

  /**
   * Reapplies the latest locally undone document operation.
   */
  redo(): void;

  /**
   * Adds a block definition to the runtime registry.
   *
   * @param definition - Definition for a unique native block type.
   * @returns Idempotent function that removes this definition.
   */
  defineBlock(definition: BlockDefinition): () => void;

  /**
   * Releases runtime subscriptions, registries, and history resources.
   */
  destroy(): void;
}
