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
  ModeManagerApi,
  SelectionManagerApi,
} from "../managers";
import type { DocumentModel } from "@chulane/document-model";
import type { EditorSnapshot, EditorSnapshotUpdate } from "./model";

/** Local presentation strategy; never persisted in collaborative state. */
export type EditorMode = "block" | "edgeless";

export interface CreateRivtoEditorOptions {
  /** Initial local presentation mode; defaults to block mode. */
  mode?: EditorMode;
  /** Fixed caller-owned model; editor destruction does not destroy it. */
  document: DocumentModel;
}

/**
 * Public editor coordinator exposed to UI and integrations.
 *
 * Block and element behavior is intentionally available only through
 * `.blocks` and `.elements`. The editor itself owns cross-cutting runtime lifecycle,
 * commands, selection, history, mode, snapshots, and document subscriptions.
 */
export interface RivtoEditorApi {
  /** Typed block operations. */
  readonly blocks: BlockManagerApi;
  /** Editor-wide list-property defaults and semantic validation. */
  readonly blockListProps: BlockListPropsManagerApi;
  /** Native block definitions, defaults, and property validation. */
  readonly blockRegistry: BlockRegistryManagerApi;
  /** Generic first-class canvas element operations. */
  readonly elements: ElementManagerApi;
  /** Named command registry shared by managers and integrations. */
  readonly commands: CommandRegistryApi;
  /** Local block/edgeless presentation mode shared by views of this editor. */
  readonly mode: ModeManagerApi;
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
   * @returns The fixed model used by every read, mutation, and subscription of this editor.
   */
  getDocument(): DocumentModel;

  /**
   * Replaces supplied sections in the fixed document and clears its previous local history.
   *
   * @param snapshot - Snapshot-v6 sections to validate and load.
   * @returns No value.
   */
  load(snapshot: EditorSnapshotUpdate): void;

  /**
   * Materializes complete portable state from the fixed document.
   *
   * @returns Detached snapshot-v6 value.
   */
  dump(): EditorSnapshot;

  /**
   * Releases runtime subscriptions, managers, and registries without destroying the caller-owned document.
   *
   * @returns A Promise that resolves after runtime cleanup; document consumers and provider connections remain owned by the caller.
   */
  destroy(): Promise<void>;
}
