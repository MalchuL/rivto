/**
 * Editor coordinator contracts. Selection and clipboard types live with their owning managers.
 */
import type { BlockManager, BlockRegistryManager, ClipboardManager, CommandHandler, CommandRegistry, ElementManager, RegisteredCommand, ModeManager, SelectionManager, UndoManager } from "../managers";
import type { CRDTDoc } from "@chulane/crdt-doc";
import type { DocumentModel } from "@chulane/document-model";
import type { EditorSnapshot, EditorSnapshotUpdate } from "./model";

/** Local presentation strategy; never persisted in collaborative state. */
export type EditorMode = "block" | "edgeless";

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
