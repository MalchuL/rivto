import type { Unsubscribe } from "@chulane/crdt-doc";
import type {
  DocumentBlockManager,
  DocumentElementManager,
  DocumentPluginDataManager,
  DocumentUndoManager,
} from "../managers";

/** Opaque properties interpreted by page/outline extensions. */
export type BlockListProps = Record<string, unknown>;

/** Axis-aligned geometry shared by every first-class canvas element. */
export interface ElementFrame {
  /** Horizontal canvas coordinate; any finite value is accepted. */
  x: number;
  /** Vertical canvas coordinate; any finite value is accepted. */
  y: number;
  /** Positive rendered width. */
  width: number;
  /** Positive rendered height. */
  height: number;
}

/** Generic first-class canvas record; element-specific props are interpreted by renderers. */
export interface DocumentElement<Props extends Record<string, unknown> = Record<string, unknown>> {
  /** Stable collaborative identity. */
  id: string;
  /** Renderer-defined discriminator; core does not register or interpret it. */
  type: string;
  /** Common persisted geometry shared by all element types. */
  frame: ElementFrame;
  /** Finite stacking order interpreted by the presentation layer. */
  zIndex: number;
  /** Opaque type-specific data owned and validated by its extension. */
  props: Props;
}

/** Complete data accepted when creating a first-class canvas element. */
export interface ElementInput<Props extends Record<string, unknown> = Record<string, unknown>> {
  id?: string;
  type: string;
  frame: ElementFrame;
  zIndex: number;
  props?: Props;
}

/** Mutable fields of a first-class canvas element. */
export interface ElementPatch {
  frame?: Partial<ElementFrame>;
  zIndex?: number;
  props?: Record<string, unknown>;
}

/** One identified element patch applied atomically with its peers. */
export interface ElementUpdate {
  id: string;
  patch: ElementPatch;
}

/** Serializable block value read from collaborative storage. */
export interface Block {
  id: string;
  type: string;
  /** Opaque page/outline properties interpreted by installed extensions. */
  listProps: BlockListProps;
  props: Record<string, unknown>;
  pluginData: Record<string, unknown>;
  /** Plain Markdown source stored collaboratively as CRDTText. */
  content: string;
  children: Block[];
}

/** Complete input accepted when creating a block. */
export interface BlockInput {
  type: string;
  id?: string;
  /** Initial opaque page/outline properties. */
  listProps?: BlockListProps;
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string;
  children?: BlockInput[];
}

/** Mutable block fields; a block's type and identity are intentionally immutable. */
export interface BlockPatch {
  /** Shallow-merges supplied page/outline properties. */
  listProps?: BlockListProps;
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string;
}

/** One identified block patch used by atomic multi-block updates. */
export interface BlockUpdate {
  id: string;
  patch: BlockPatch;
}

/** Factory that returns a new stable entity identity. */
export type GenerateId = () => string;

/** Lossless, versioned document value used for persistence. */
export interface Snapshot {
  version: 6;
  blocks: Block[];
  elements: DocumentElement[];
  pluginData?: Record<string, unknown>;
}

/** Sections received from persistence that should replace only supplied state. */
export interface SnapshotUpdate {
  version: 6;
  blocks?: Block[];
  elements?: DocumentElement[];
  pluginData?: Record<string, unknown>;
}

/**
 * Public collaborative document coordinator used by editors and persistence.
 *
 * Block and element behavior is intentionally available only through
 * `.blocks` and `.elements`. The document itself owns lifecycle, transactions, undo scopes,
 * and complete snapshot orchestration.
 */
export interface DocumentModel {
  /** Descriptive document identifier that does not control persistence. */
  readonly id: string;
  /** Block records, text, hierarchy, and block snapshot operations. */
  readonly blocks: DocumentBlockManager;
  /** First-class generic canvas elements and geometry. */
  readonly elements: DocumentElementManager;
  /** Generic namespaced collaborative storage for optional document plugins. */
  readonly pluginData: DocumentPluginDataManager;
  /** Local undo/redo history for mutations across all document managers. */
  readonly history: DocumentUndoManager;

  /**
   * Subscribes to local and remote collaborative updates.
   *
   * @param listener - Callback invoked after a document update.
   * @returns Function that removes the subscription.
   */
  subscribe(listener: () => void): Unsubscribe;

  /**
   * Groups synchronous mutations into one transaction and undo item.
   *
   * @param operation - Synchronous document work to execute atomically.
   * @returns Value returned by the operation.
   */
  batchUpdates<Result>(operation: () => Result): Result;

  /**
   * Groups synchronous mutations into one transaction excluded from undo history.
   *
   * @param operation - Synchronous document work to execute without an undo item.
   * @returns Value returned by the operation.
   */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result;

  /**
   * Produces a lossless schema-v6 snapshot.
   *
   * @returns Detached blocks, elements, and document plugin data.
   */
  getSnapshot(): Snapshot;

  /**
   * Replaces only supplied schema-v6 snapshot sections.
   *
   * Partial updates replace present sections and leave omitted collaborative
   * state unchanged.
   *
   * @param snapshot - Complete snapshot or partial persistence update.
   * @returns No value.
   */
  loadSnapshot(snapshot: SnapshotUpdate): void;

  /**
   * Releases document history, subscriptions, providers, and collaborative storage.
   *
   * @returns Promise resolved after asynchronous CRDT cleanup.
   */
  destroy(): Promise<void>;
}
