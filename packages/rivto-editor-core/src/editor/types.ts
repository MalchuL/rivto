/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import type { BlockManager, BlockRegistryManager, ClipboardManager, CommandHandler, CommandRegistry, ElementManager, RegisteredCommand, ModeManager, SelectionManager, UndoManager } from "../managers";
import type { CRDTDoc } from "@chulane/crdt-doc";
import type { DocumentModel } from "@chulane/document-model";
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

/** Host-provided text range used by framework-neutral editing operations. */
export interface TextRange {
  /** Discriminant retained for selection-compatible host values. */
  type: "text";
  /** Endpoint where the gesture began. */
  anchor: EditorPosition;
  /** Active endpoint; may precede anchor for reverse selection. */
  head: EditorPosition;
}

/**
 * Shared runtime contract for local selection implementations.
 *
 * Selection state belongs to editor runtimes rather than the persisted
 * document. Concrete implementations keep their own fields and provide the
 * two operations required by stores: comparison and detached copying.
 */
export abstract class BaseSelection<Type extends string = string> {
  /** Concrete selection discriminator. */
  abstract readonly type: Type;

  /**
   * Compares this selection with another runtime selection.
   * @param other - Selection to compare.
   * @returns Whether both selections describe the same local state.
   */
  abstract equals(other: BaseSelection): boolean;

  /**
   * Creates a detached selection safe for callers to retain or mutate.
   * @returns Independent selection with the same local state.
   */
  abstract clone(): BaseSelection<Type>;
}

/** Plain whole-block value accepted at public mutation boundaries. */
export interface BlockSelectionInput {
  /** Discriminant for ordered document-block selection. */
  type: "block";
  /** Selected IDs in visible document order. */
  blockIds: string[];
  /** Block where the selection gesture began. */
  anchorBlockId: string;
  /** Active end of the selection gesture. */
  focusBlockId: string;
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
export class BlockSelection extends BaseSelection<"block"> {
  /** Discriminant for ordered document-block selection. */
  readonly type = "block";
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

  /**
   * Creates an ordered whole-block selection.
   * @param input - Selected IDs and directed gesture endpoints.
   */
  constructor(input: Omit<BlockSelectionInput, "type"> | BlockSelectionInput) {
    super();
    this.blockIds = [...input.blockIds];
    this.anchorBlockId = input.anchorBlockId;
    this.focusBlockId = input.focusBlockId;
  }

  /**
   * Compares directed endpoints and ordered block membership.
   * @param other - Runtime selection to compare.
   * @returns Whether both block selections describe the same state.
   */
  equals(other: BaseSelection): boolean {
    return other instanceof BlockSelection
      && this.anchorBlockId === other.anchorBlockId
      && this.focusBlockId === other.focusBlockId
      && this.blockIds.length === other.blockIds.length
      && this.blockIds.every((id, index) => id === other.blockIds[index]);
  }

  /**
   * Creates a detached copy of this block selection.
   * @returns Independent block selection.
   */
  clone(): BlockSelection {
    return new BlockSelection(this);
  }
}

/** One independently meaningful whole-block value accepted by SelectionManager. */
export type EditorSelectionItem = BlockSelectionInput;

/**
 * Ordered local selection state.
 *
 * Only whole blocks belong here. Text ranges are explicit editing-operation
 * inputs owned by the browser host and cannot widen a block selection.
 */
export type EditorSelection = EditorSelectionItem[];

export interface CreateRivtoEditorOptions {
  document?: CRDTDoc;
  mode?: EditorMode;
}

/**
 * Public editor coordinator exposed to UI and integrations.
 *
 * Block and element behavior is intentionally available only through
 * `.blocks` and `.elements`. The editor itself owns cross-cutting runtime lifecycle,
 * commands, batching, selection, history, mode, snapshots, and subscriptions.
 */
export interface RivtoEditorApi {
  /** Canonical collaborative document and persistence boundary. */
  readonly document: DocumentModel;
  /** Block commands and typed block operations. */
  readonly blocks: BlockManager;
  /** Native block definitions, defaults, and property validation. */
  readonly blocksRegistry: BlockRegistryManager;
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
