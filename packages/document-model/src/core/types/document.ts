/**
 * Defines the portable public document-model contract.
 *
 * These interfaces describe store capabilities rather than concrete CRDT-backed
 * manager classes, allowing hosts to extend or replace a document model without
 * inheriting adapter state or exposing persistence-only operations.
 */

/** Opaque properties interpreted by page/outline extensions. */
export type BlockListProps = Record<string, unknown>;

/** Current document snapshot schema version. */
export const DOCUMENT_SNAPSHOT_VERSION = 6 as const;

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

/** Detached block fields with direct child IDs instead of child subtrees. */
export type BlockNode = Omit<Block, "children"> & { readonly childIds: readonly string[] };

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

/** Public block-store capabilities required by editors and extensions. */
export interface DocumentBlockManagerApi {
  /** Monotonic block-data and hierarchy revision. */
  readonly revision: number;
  /** Whether the root block list is empty. */
  readonly isEmpty: boolean;
  /** @param id - Block identifier. @returns Whether the block exists. */
  hasBlock(id: string): boolean;
  /** @param id - Block identifier. @returns Detached block subtree when present. */
  getBlock(id: string): Block | undefined;
  /** @param id - Block identifier. @returns Detached non-recursive node fields when present. Identity is stable until this record's own fields change. */
  getBlockNode(id: string): BlockNode | undefined;
  /** @returns Detached root block trees. */
  getBlocks(): Block[];
  /** @returns Ordered root block identifiers. */
  getRootIds(): string[];
  /** @param id - Block identifier. @param listener - Change callback. @returns Unsubscribe callback. */
  subscribeBlock(id: string, listener: () => void): () => void;
  /** @param id - Block identifier. @param listener - Node change callback. @returns Unsubscribe callback. */
  subscribeBlockNode(id: string, listener: () => void): () => void;
  /** @param listener - Root-list callback. @returns Unsubscribe callback. */
  subscribeRootIds(listener: () => void): () => void;
  /** @param listener - Hierarchy callback. @returns Unsubscribe callback. */
  subscribeStructure(listener: () => void): () => void;
  /** @param id - Parent block identifier. @returns True when the block has at least one child. */
  hasChildren(id: string): boolean;
  /** @param id - Block identifier. @returns Parent ID, null for roots, or undefined when absent. */
  getParentId(id: string): string | null | undefined;
  /** @param id - Block identifier. @returns True when the block exists and has no parent. */
  isRootBlock(id: string): boolean;
  /**
   * Creates a source-to-destination ID map for an immediate import.
   * Available source IDs are preserved, while IDs already used by this document
   * receive generated replacements. This does not insert or reserve any ID.
   * @param sourceIds - Source IDs in import order.
   * @returns Destination ID for every source ID.
   */
  createImportIdMap(sourceIds: readonly string[]): ReadonlyMap<string, string>;
  /** @param block - Block to insert. @param afterId - Optional sibling anchor. @returns Complete inserted block. */
  insertBlock(block: BlockInput, afterId?: string | null): Block;
  /** @param id - Block identifier. @param patch - Fields to update. @returns Updated non-recursive block fields. */
  updateBlock(id: string, patch: BlockPatch): BlockNode;
  /** @param updates - Ordered block patches. @returns Updated non-recursive block fields in input order. */
  updateBlocks(updates: readonly BlockUpdate[]): BlockNode[];
  /** @param id - Block identifier. @param type - New block type. @param props - Complete new properties. @returns No value. */
  setBlockType(id: string, type: string, props?: Record<string, unknown>): void;
  /** @param id - Block identifier. @param key - Property name. @param value - Portable value or undefined to delete. @returns No value. */
  setBlockProp(id: string, key: string, value: unknown): void;
  /** @param id - Block identifier. @param keys - List-property names. @returns Whether the block existed. */
  deleteListProps(id: string, keys: readonly string[]): boolean;
  /** @param updates - Block IDs and list-property names. @returns No value. */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): void;
  /** @param id - Block identifier. @param pluginId - Plugin namespace. @param value - Portable value. @returns No value. */
  setPluginData(id: string, pluginId: string, value: unknown): void;
  /** @param id - Block identifier. @param text - Complete replacement text. @returns No value. */
  setBlockText(id: string, text: string): void;
  /** @param id - Block identifier. @param offset - Insertion offset. @param text - Text to insert. @returns No value. */
  insertText(id: string, offset: number, text: string): void;
  /** @param id - Block identifier. @param offset - Start offset. @param length - Character count. @returns No value. */
  deleteText(id: string, offset: number, length: number): void;
  /** @param id - Block subtree root. @returns No value. */
  removeBlock(id: string): void;
  /** @param id - Block to move. @param targetId - Placement anchor. @param position - Placement relative to the anchor. @returns No value. */
  moveBlock(id: string, targetId: string | null, position?: "before" | "after" | "inside"): void;
  /** @param moves - Ordered block placements. @returns No value. */
  moveBlocks(moves: readonly {
    id: string;
    targetId: string | null;
    position: "before" | "after" | "inside";
  }[]): void;
  /** @param id - Block that adopts all later siblings as children. @returns No value. */
  adoptFollowingSiblings(id: string): void;
  /** @param blocks - Complete portable block forest to validate. @returns No value. */
  validateBlocks(blocks: readonly Block[]): void;
  /** @param blocks - Complete portable block forest replacing stored blocks. @returns No value. */
  loadBlocks(blocks: readonly Block[]): void;
  /** @returns No value after repairing invalid hierarchy references. */
  normalize(): void;
}

/** Public element-store capabilities required by editors and extensions. */
export interface DocumentElementManagerApi {
  /** @param id - Element identifier. @returns Whether the element exists. */
  hasElement(id: string): boolean;
  /** @param id - Element identifier. @returns Detached element when present. */
  getElement(id: string): DocumentElement | undefined;
  /** @returns Detached elements in storage order. */
  getElements(): DocumentElement[];
  /** @param listener - Collection callback. @returns Unsubscribe callback. */
  subscribe(listener: () => void): () => void;
  /** @param id - Element identifier. @param listener - Change callback. @returns Unsubscribe callback. */
  subscribeElement(id: string, listener: () => void): () => void;
  /** @param listener - Membership callback. @returns Unsubscribe callback. */
  subscribeMembership(listener: () => void): () => void;
  /**
   * Creates a source-to-destination ID map for an immediate import.
   * Available source IDs are preserved, while IDs already used by this document
   * receive generated replacements. This does not insert or reserve any ID.
   * @param sourceIds - Source IDs in import order.
   * @returns Destination ID for every source ID.
   */
  createImportIdMap(sourceIds: readonly string[]): ReadonlyMap<string, string>;
  /** @param input - Element to insert. @returns Complete inserted element. */
  insertElement(input: ElementInput): DocumentElement;
  /** @param id - Element identifier. @param patch - Fields to update. @returns Complete updated element. */
  updateElement(id: string, patch: ElementPatch): DocumentElement;
  /** @param updates - Ordered element patches. @returns Complete updated elements in input order. */
  updateElements(updates: readonly ElementUpdate[]): DocumentElement[];
  /** @param id - Element identifier. @returns No value. */
  removeElement(id: string): void;
  /** @param ids - Element identifiers. @returns No value. */
  removeElements(ids: readonly string[]): void;
  /** @param elements - Complete portable element collection to validate. @returns No value. */
  validateElements(elements: readonly DocumentElement[]): void;
  /** @param elements - Complete portable element collection replacing stored elements. @returns No value. */
  loadElements(elements: readonly DocumentElement[]): void;
}

/** Public namespaced plugin-data store. */
export interface DocumentPluginDataManagerApi {
  /** @param pluginId - Plugin namespace. @returns Detached namespace data when present. */
  get<Value = unknown>(pluginId: string): Value | undefined;
  /** @param pluginId - Plugin namespace. @param value - Portable namespace value. @returns No value. */
  set(pluginId: string, value: unknown): void;
  /** @param pluginId - Plugin namespace. @param key - Field name. @returns Detached field value when present. */
  getField<Value = unknown>(pluginId: string, key: string): Value | undefined;
  /** @param pluginId - Plugin namespace. @param key - Field name. @param value - Portable field value. @returns No value. */
  setField(pluginId: string, key: string, value: unknown): void;
  /** @param pluginId - Plugin namespace. @param key - Field name. @returns Whether the field existed. */
  deleteField(pluginId: string, key: string): boolean;
  /** @param pluginId - Plugin namespace. @returns Whether the namespace existed. */
  delete(pluginId: string): boolean;
  /** @returns Detached data for every plugin namespace. */
  getAll(): Record<string, unknown>;
  /** @param values - Complete plugin-data value replacing stored namespaces. @returns No value. */
  load(values: Record<string, unknown>): void;
}

/** Public local-history capabilities owned by a document model. */
export interface DocumentHistoryManagerApi {
  /** @param operation - Synchronous work grouped into one undo item. @returns The operation result. */
  batchUpdates<Result>(operation: () => Result): Result;
  /** @param operation - Synchronous work excluded from undo history. @returns The operation result. */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result;
  /** @returns No value after undoing the latest local change. */
  undo(): void;
  /** @returns No value after redoing the latest reverted change. */
  redo(): void;
  /** @returns No value after clearing undo and redo history. */
  clear(): void;
  /** @returns No value after ending the current capture group. */
  stopCapturing(): void;
  /** @returns No value after releasing history resources. */
  destroy(): void;
}

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
 * `.blocks` and `.elements`. The document itself owns lifecycle,
 * history construction, and complete snapshot orchestration.
 */
export interface DocumentModel {
  /** Descriptive document identifier that does not control persistence. */
  readonly id: string;
  /** Block records, text, hierarchy, and block snapshot operations. */
  readonly blocks: DocumentBlockManagerApi;
  /** First-class generic canvas elements and geometry. */
  readonly elements: DocumentElementManagerApi;
  /** Generic namespaced collaborative storage for optional document plugins. */
  readonly pluginData: DocumentPluginDataManagerApi;
  /** Local history and transaction batching across all document managers. */
  readonly history: DocumentHistoryManagerApi;

  /**
   * Subscribes to local and remote collaborative updates.
   *
   * @param listener - Callback invoked after a document update.
   * @returns Function that removes the subscription.
   */
  subscribe(listener: () => void): () => void;

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
