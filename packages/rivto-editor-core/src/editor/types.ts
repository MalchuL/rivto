import type { BlockManager, BlockRegistryManager, ClipboardManager, CommandHandler, CommandRegistry, ElementManager, RegisteredCommand, LinkManager, ModeManager, SelectionManager, UndoManager } from "../managers";
import type { CRDTDoc } from "../store/crdt-doc";
import type { DocumentModel } from "../store/document-model";
import type { EditorSnapshot, EditorSnapshotUpdate } from "./model";

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
 * Public editor coordinator exposed to UI and integrations.
 *
 * Block, link, and element behavior is intentionally available only through
 * `.blocks`, `.links`, and `.elements`. The editor itself owns cross-cutting runtime lifecycle,
 * commands, batching, selection, history, mode, snapshots, and subscriptions.
 */
export interface RivtoEditorApi {
  /** Canonical collaborative document and persistence boundary. */
  readonly document: DocumentModel;
  /** Block commands and typed block operations. */
  readonly blocks: BlockManager;
  /** Native block definitions, defaults, and property validation. */
  readonly blocksRegistry: BlockRegistryManager;
  /** First-class link commands and typed link operations. */
  readonly links: LinkManager;
  /** Generic first-class canvas element operations. */
  readonly elements: ElementManager;
  /** Named command registry shared by managers and integrations. */
  readonly commands: CommandRegistry;
  /** Local block/edgeless presentation mode. */
  readonly mode: ModeManager;
  /** Local ordered text and whole-block selection state. */
  readonly selection: SelectionManager;
  /** Framework-neutral structured clipboard operations. */
  readonly clipboard: ClipboardManager;
  /** Local undo/redo history for document mutations. */
  readonly history: UndoManager;
  /** Monotonic view invalidation snapshot. */
  readonly revision: number;

  /**
   * Subscribes to runtime revisions.
   *
   * @param listener - Callback invoked after an observable runtime change.
   * @returns Function that removes the listener.
   */
  subscribe(listener: () => void): () => void;

  /**
   * Groups synchronous editor mutations into one transaction and undo item.
   *
   * @param operation - Synchronous editor work to execute.
   * @returns Value returned by the operation.
   */
  batchUpdates<Result>(operation: () => Result): Result;

  /**
   * Registers one named runtime command.
   *
   * @param name - Unique command identifier.
   * @param handler - Command implementation.
   * @returns Ownership handle for the exact registration.
   */
  register(name: string, handler: CommandHandler): RegisteredCommand;

  /**
   * Executes one registered runtime command.
   *
   * @param name - Command identifier to execute.
   * @param payload - Optional command payload.
   * @returns Command handler result.
   */
  execute(name: string, payload?: unknown): unknown;

  /**
   * Removes one command registration by name.
   *
   * @param name - Command identifier to remove.
   * @returns No value.
   */
  removeCommand(name: string): void;

  /**
   * Deletes the complete active selection as one undoable operation.
   *
   * @returns No value.
   */
  deleteSelection(): void;

  /**
   * Replaces supplied document sections and clears previous local history.
   *
   * @param snapshot - Snapshot-v6 sections to validate and load.
   * @returns No value.
   */
  load(snapshot: EditorSnapshotUpdate): void;

  /**
   * Materializes the complete portable document state.
   *
   * @returns Detached snapshot-v6 value.
   */
  dump(): EditorSnapshot;

  /**
   * Reverts the latest captured local document operation.
   *
   * @returns No value.
   */
  undo(): void;

  /**
   * Reapplies the latest locally undone document operation.
   *
   * @returns No value.
   */
  redo(): void;

  /**
   * Releases runtime subscriptions, managers, registries, and history.
   *
   * @returns A Promise that resolves after runtime, provider, and CRDT cleanup.
   */
  destroy(): Promise<void>;
}
