/**
 * Editor coordinator contracts. Selection and clipboard types live with their owning managers.
 */
import type { BlockManager, BlockRegistryManager, ClipboardManager, CommandRegistry, ElementManager, HistoryManager, ModeManager, SelectionManager } from "../managers";
import type { DocumentModel } from "@chulane/document-model";
import type { EditorSnapshot, EditorSnapshotUpdate } from "./model";

/** Local presentation strategy; never persisted in collaborative state. */
export type EditorMode = "block" | "edgeless";

export interface CreateRivtoEditorOptions {
  /** Initial local presentation mode; defaults to block mode. */
  mode?: EditorMode;
}

/**
 * Public editor coordinator exposed to UI and integrations.
 *
 * Block and element behavior is intentionally available only through
 * `.blocks` and `.elements`. The editor itself owns cross-cutting runtime lifecycle,
 * commands, selection, history, mode, snapshots, and subscriptions.
 */
export interface RivtoEditorApi {
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
  /** Local history and transaction batching for document mutations. */
  readonly history: HistoryManager;
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
   * @returns The document model currently presented by this editor, or undefined while unbound.
   */
  getDocument(): DocumentModel | undefined;

  /**
   * Replaces the active document while preserving editor and manager identity.
   * @param document - Caller-owned model to present.
   * @returns No value.
   */
  setDocument(document: DocumentModel): void;

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
   * Releases runtime subscriptions, managers, and registries without destroying the caller-owned document.
   *
   * @returns A Promise that resolves after runtime, provider, and CRDT cleanup.
   */
  destroy(): Promise<void>;
}
