import type { ElementRegistryApi } from "../managers/element-registry";
/**
 * Editor coordinator contracts. Selection and clipboard types live with their owning managers.
 */
import type {
  BlockManagerApi,
  BlockListPropsManagerApi,
  BlockRegistryManagerApi,
  ClipboardManagerApi,
  CommandRegistryApi,
  ElementManagerApi,
  HistoryManagerApi,
  HistoryBatch,
  SelectionManagerApi,
} from "../managers";
import type { DocumentModel } from "@chulane/document-model";
import type { EditorSnapshot, EditorSnapshotUpdate } from "./model";

/** Local presentation strategy; never persisted in collaborative state. */
export type EditorMode = "block" | "edgeless";

export interface CreateDocumentEditorOptions {
  /** Fixed caller-owned model; editor destruction does not destroy it. */
  document: DocumentModel;
}

/** Borrowed document and undo grouping used by block and element operations. */
export interface DocumentCommandsEditor {
  readonly history: HistoryBatch;
  /**
   * Supplies the fixed model used by this editor's reads, mutations, and subscriptions.
   *
   * @returns The caller-owned collaborative model.
   */
  getDocument(): DocumentModel;
}

/**
 * Public editor coordinator exposed to UI and integrations.
 *
 * Block and element operations live on `.blocks` and `.elements`; editor-local
 * structural policy is owned by `.blocks`. The editor owns their
 * lifecycle as well as commands, selection, history, snapshots, and subscriptions.
 */
export interface DocumentEditorAPI extends DocumentCommandsEditor {
  /** Definitions applied by the element command pipeline; loading unknown types remains lossless. */
  readonly elementRegistry: ElementRegistryApi;
  /** Typed block operations. */
  readonly blocks: BlockManagerApi;
  /** Editor-wide list-property defaults and semantic validation. */
  readonly blockListProps: BlockListPropsManagerApi;
  /** Native block definitions, behavior registrations, defaults, and property validation. */
  readonly blockRegistry: BlockRegistryManagerApi;
  /** Generic first-class canvas element operations. */
  readonly elements: ElementManagerApi;
  /** Named command registry shared by managers and integrations. */
  readonly commands: CommandRegistryApi;
  /** Local ordered text and whole-block selection state. */
  readonly selection: SelectionManagerApi;
  /** Framework-neutral structured clipboard operations. */
  readonly clipboard: ClipboardManagerApi;
  /** Local history and transaction batching for document mutations. */
  readonly history: HistoryManagerApi;
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
   * Replaces supplied sections in the fixed document and clears its previous local history.
   *
   * @param snapshot - Snapshot-v7 sections to validate and load.
   * @returns No value.
   */
  load(snapshot: EditorSnapshotUpdate): void;

  /**
   * Materializes complete portable state from the fixed document.
   *
   * @returns Detached snapshot-v7 value.
   */
  dump(): EditorSnapshot;

  /**
   * Releases runtime subscriptions, managers, and registries without destroying the caller-owned document.
   *
   * @returns A Promise that resolves after runtime cleanup; document consumers and provider connections remain owned by the caller.
   */
  destroy(): Promise<void>;
}
