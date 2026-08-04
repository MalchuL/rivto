import type { CRDTDoc, CRDTUndoScope, Unsubscribe } from "../../../crdt-doc";
import type { BlockListProps } from "../../../../blocks";
import type {
  DocumentBlockManager,
  DocumentLinkManager,
  DocumentPluginDataManager,
} from "../managers";

/** Collaborative block geometry shared by all renderers. */
export interface BlockLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

/** Serializable block value read from collaborative storage. */
export interface Block {
  id: string;
  type: string;
  /** Persisted outline visibility; renderers decide whether to honor it. */
  collapsed: boolean;
  /** Presentation used when this block renders among sibling blocks. */
  listProps: BlockListProps;
  props: Record<string, unknown>;
  pluginData: Record<string, unknown>;
  /** Plain Markdown source stored collaboratively as CRDTText. */
  content: string;
  children: Block[];
  layout?: BlockLayout;
}

/** First-class connection between two collaborative blocks. */
export interface Link {
  id: string;
  from: { blockId: string; port?: string };
  to: { blockId: string; port?: string };
  meta?: Record<string, unknown>;
}

/** Complete input accepted when creating a block. */
export interface BlockInput {
  type: string;
  id?: string;
  /** Initial outline visibility; omitted creation values default to false. */
  collapsed?: boolean;
  /** Initial multi-block presentation; omitted members receive their defaults. */
  listProps?: Partial<BlockListProps>;
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string;
  children?: BlockInput[];
  layout?: Partial<BlockLayout>;
}

/** Mutable block fields; a block's type and identity are intentionally immutable. */
export interface BlockPatch {
  /** Replaces the persisted outline visibility when supplied. */
  collapsed?: boolean;
  /** Merges supplied multi-block presentation fields. */
  listProps?: Partial<BlockListProps>;
  props?: Record<string, unknown>;
  pluginData?: Record<string, unknown>;
  content?: string;
  layout?: Partial<BlockLayout>;
}

/** One identified block patch used by atomic multi-block updates. */
export interface BlockUpdate {
  id: string;
  patch: BlockPatch;
}

/** Lossless, versioned document value used for persistence. */
export interface Snapshot {
  version: 4;
  blocks: Block[];
  links: Link[];
  pluginData?: Record<string, unknown>;
}

/** Sections received from persistence that should replace only supplied state. */
export interface SnapshotUpdate {
  version: 4;
  blocks?: Block[];
  links?: Link[];
  pluginData?: Record<string, unknown>;
}

/** Library-neutral block property validator. */
export type BlockPropsValidator = (
  type: string,
  props: Record<string, unknown>,
) => Record<string, unknown>;

/**
 * Public collaborative document coordinator used by editors and persistence.
 *
 * Block and link behavior is intentionally available only through `.blocks`
 * and `.links`. The document itself owns lifecycle, transactions, undo scopes,
 * and complete snapshot orchestration.
 */
export interface DocumentModel {
  /** Descriptive document identifier that does not control persistence. */
  readonly id: string;
  /** Adapter-neutral collaborative document containing canonical shared state. */
  readonly crdt: CRDTDoc;
  /** Stable local transaction origin used to scope undo history. */
  readonly origin: symbol;
  /** Collaborative containers included in local undo tracking. */
  readonly undoScopes: CRDTUndoScope[];
  /** Block records, text, layout, hierarchy, and block snapshot operations. */
  readonly blocks: DocumentBlockManager;
  /** First-class link records and link snapshot operations. */
  readonly links: DocumentLinkManager;
  /** Generic namespaced collaborative storage for optional document plugins. */
  readonly pluginData: DocumentPluginDataManager;

  /**
   * Subscribes to local and remote collaborative updates.
   *
   * @param listener - Callback invoked after a document update.
   * @returns Function that removes the subscription.
   */
  subscribe(listener: () => void): Unsubscribe;

  /**
   * Executes one synchronous mutation under the model's local origin.
   *
   * @param operation - Collaborative mutation to execute atomically.
   * @returns No value.
   */
  transact(operation: () => void): void;

  /**
   * Produces a lossless schema-v4 snapshot.
   *
   * @returns Detached blocks, links, and document plugin data.
   */
  getSnapshot(): Snapshot;

  /**
   * Replaces only supplied schema-v4 snapshot sections.
   *
   * @param snapshot - Complete snapshot or partial persistence update.
   * @returns No value.
   */
  loadSnapshot(snapshot: SnapshotUpdate): void;
}
