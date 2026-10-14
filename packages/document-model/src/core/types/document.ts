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
export const DOCUMENT_SNAPSHOT_VERSION = 9 as const;

/**
 * Axis-aligned geometry shared by every first-class canvas element.
 * Coordinates and dimensions use unscaled canvas units, before viewport pan or zoom.
 * Nested elements keep canvas coordinates rather than offsets from their parent.
 * All values must be finite; width and height must also be strictly positive.
 */
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

/**
 * Detached flat canvas record with direct child IDs rather than nested snapshots.
 *
 * Element-specific props are interpreted by renderers. Parentage is derived
 * from document roots and child lists. Manager reads may return cached objects; treat them as
 * read-only and use manager commands for mutations. Use DocumentElement when a
 * complete child tree is needed; persisted snapshots use ElementSnapshot instead.
 */
export interface ElementNode<Props extends Record<string, unknown> = Record<string, unknown>> {
  /** Stable collaborative identity. */
  id: string;
  /** Ordered direct children. Structural operations, rather than props patches, change this list. */
  childIds: string[];
  /** Renderer-defined discriminator; core does not register or interpret it. */
  type: string;
  /** Common persisted geometry shared by all element types. */
  frame: ElementFrame;
  /** Finite stacking order interpreted by the presentation layer. */
  zIndex: number;
  /** Opaque type-specific data owned and validated by its extension. */
  props: Props;
}

/**
 * Detached element and its complete child tree, assembled only when requested.
 *
 * children replaces childIds and follows the stored sibling order at every level.
 * Frames at every depth remain in canvas coordinates,
 * not relative to their parent. Manager reads cache unchanged branches, so treat
 * the entire value as read-only. The Props parameter describes this node's props;
 * descendants may use other element types and property shapes.
 */
export type DocumentElement<Props extends Record<string, unknown> = Record<string, unknown>> = Omit<
  ElementNode<Props>,
  "childIds"
> & { children: DocumentElement[] };

/**
 * Creation data for an element and optional new child subtrees.
 * Elements with children may omit frame to use the union of their children at insertion;
 * an element without children requires explicit geometry.
 * That inferred frame is an initial value, not a live bound updated on child edits.
 *
 * children creates records recursively; childIds reparents existing subtrees.
 * Supplied IDs must be unique in the input tree and destination document. Insertion
 * preserves them and allocates missing IDs. Copying a still-present tree into the
 * same document therefore requires remapping IDs first.
 */
export type ElementInput<Props extends Record<string, unknown> = Record<string, unknown>> = {
  /**
   * Ordered existing subtrees to reparent from this document. IDs must
   * be distinct and selected subtrees must not overlap. A nonempty list cannot
   * accompany a defined children array. Prefer children when creating new records.
   */
  childIds?: readonly string[];
  /**
   * New child subtrees in sibling order; their parents are determined by nesting.
   * Omitted or empty means no new children. A defined array cannot be combined
   * with nonempty childIds, and cyclic input objects are rejected.
   */
  children?: ElementInput[];
  /** Stable ID to preserve; omitted to allocate one. Existing document IDs are rejected. */
  id?: string;
  /** Required finite stacking value; presentation decides how it affects drawing order. */
  zIndex: number;
  /** Initial portable type-specific properties; omitted to use an empty object. */
  props?: Props;
  /** Renderer or extension type; the model treats all types with the same hierarchy rules. */
  type: string;
  /** Canvas geometry; omission derives bounds from children and fails for a leaf. */
  frame?: ElementFrame;
};

/**
 * Mutable fields of a canvas record; omitted fields remain unchanged.
 * Identity, type, and child lists require separate operations.
 */
export interface ElementPatch {
  /** Shallow-merged canvas geometry; the complete result must remain a valid frame. */
  frame?: Partial<ElementFrame>;
  /** Replacement finite stacking value. */
  zIndex?: number;
  /** Shallow-merged properties; an undefined value removes that property key. */
  props?: Record<string, unknown>;
}

/** One identified element patch applied atomically with its peers. */
export interface ElementUpdate {
  /** Existing element ID; repeated IDs in a batch observe earlier patches. */
  id: string;
  /** Changes for this step; results are returned in the same order as the updates. */
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
/** Placement in a real document child list; omitted beforeId appends. */
export interface BlockDestination {
  /** Actual parent block, or null for document roots. */
  readonly parentId: string | null;
  /** Immediate child of that parent before which to insert. */
  readonly beforeId?: string;
}

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
  /**
   * Inserts portable data with new or reused stable identities; local collisions still throw.
   * @param block - Block to insert, including optional existing subtree IDs.
   * @param destination - Actual parent and optional next sibling; omitted appends to document roots.
   * @returns Complete inserted block with supplied IDs preserved and missing IDs allocated.
   * @throws If malformed, an ID exists in this document, the sibling is missing, or application identity checks fail.
   */
  insertBlock(block: BlockInput, destination?: BlockDestination): Block;
  /** @param parentId - Existing parent. @returns Its direct child IDs, empty when absent. */
  getChildIds(parentId: string): readonly string[];
  /** @param afterId - Sibling to follow, null for first document root, or omitted for append. @returns Explicit document placement. @throws When a named sibling is missing. */
  getInsertionDestinationAfter(afterId?: string | null): BlockDestination;
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
  moveBlocks(
    moves: readonly {
      id: string;
      targetId: string | null;
      position: "before" | "after" | "inside";
    }[],
  ): void;
  /**
   * Appends all later siblings of this block to its children, in their current
   * order. Used before outdent so later outline items remain below the lifted
   * block at its new depth.
   * @param id - Block receiving the sibling tail.
   * @returns No value.
   */
  moveFollowingSiblingsInside(id: string): void;
  /** @param blocks - Complete portable block forest to validate. @returns No value. */
  validateBlocks(blocks: readonly Block[]): void;
  /** @param blocks - Complete portable block forest replacing stored blocks. @returns No value. */
  loadBlocks(blocks: readonly Block[]): void;
  /** @returns No value after repairing invalid hierarchy references. */
  normalize(): void;
}

/** Public element-store capabilities required by editors and extensions. */
export interface DocumentElementManagerApi {
  /**
   * Reads one element with its complete recursive child tree.
   *
   * Children follow their stored sibling order. Outside a CRDT transaction, repeated
   * reads reuse cached objects until the node or a descendant changes; unaffected
   * branches retain their objects. Transaction reads bypass that cache. Treat the
   * returned snapshot as read-only: changing it does not update the document.
   *
   * @param id - Stable ID of the subtree root, which may itself be nested.
   * @returns Detached tree with children, or undefined when the ID is absent.
   * Use getElementNode when only this record and its child IDs are needed.
   */
  getElement(id: string): DocumentElement | undefined;
  /**
   * Reads the root element trees of the document or children of one element.
   *
   * Roots follow the document root list or the selected element's child list.
   * Descendants appear inside their parents, rather than as additional array entries.
   * Outside transactions, the array is cached until a contributing element changes,
   * and unchanged subtrees reuse their objects. Treat all returned values as read-only.
   *
   * @param rootElementId - Container ID, or null/omitted for document roots. Missing containers read as empty.
   * @returns Detached recursive roots, or an empty array when there are no elements.
   */
  getElements(rootElementId?: string | null): DocumentElement[];
  /**
   * Observes changes to one element and its complete subtree.
   *
   * Notifications include descendant edits, insertion, deletion, and changes to tree
   * placement. Moves invalidate both old and new ancestors before listeners run.
   * Registering does not invoke the listener; a currently missing ID can be observed.
   *
   * @param id - Stable ID of the subtree root to observe.
   * @param listener - Callback that can reread the current tree after invalidation.
   * @returns Function that removes this listener.
   */
  subscribeElement(id: string, listener: () => void): () => void;
  /**
   * Reads the ordered direct child IDs of an element or document root IDs, excluding descendants.
   *
   * @param rootElementId - Container ID, or null/omitted for document roots. The container itself is excluded.
   * @returns Read-only root list, with stable identity while its contents are unchanged;
   * an empty list when the selected container is missing or has no children.
   */
  getRootIds(rootElementId?: string | null): readonly string[];
  /**
   * Resolves an element's direct parent from document roots and child lists.
   *
   * @param id - Stable element ID to locate.
   * @returns Parent element ID, null for a document root, or undefined when absent.
   */
  getParentId(id: string): string | null | undefined;
  /**
   * Moves selected subtrees together, preserving IDs and canvas-relative geometry.
   * Selecting an ancestor and its descendant moves the ancestor only. The model
   * validates all references before writing; the complete move is transactional.
   * @param ids - Existing elements in destination order; duplicate IDs are ignored.
   * @param destination - Parent (null for document roots) and optional next sibling; omission appends.
   * @throws If an element or destination is missing, the anchor is not a destination
   * sibling, or the move would create a cycle.
   */
  moveElements(ids: readonly string[], destination: ElementDestination): void;
  /**
   * Replaces a parent with its children at the same position in its sibling list.
   *
   * Only the parent record is deleted. Child IDs, order, and canvas-relative geometry
   * remain unchanged. This operation accepts any element type, including a leaf;
   * a leaf is simply deleted. All document writes occur in one transaction.
   *
   * @param id - Existing parent element to remove.
   * @returns Promoted child IDs in their original order, or an empty array for a leaf.
   * @throws If the parent element does not exist.
   */
  removeElementAndPromoteChildren(id: string): readonly string[];
  /**
   * Repairs missing, duplicate, cyclic, and orphaned hierarchy references after CRDT merges.
   *
   * The first placement encountered while traversing document roots in order wins. Missing
   * and repeated references are removed; unreachable records are retained at the
   * document root. Payloads are not deleted. Repairs update root and child lists in one
   * transaction using the same hierarchy traversal as reads.
   */
  normalize(): void;
  /**
   * Checks complete document roots and element child lists without changing storage.
   *
   * Every element must be reachable exactly once from a document root. This checks
   * references and ownership, not geometry or props; validateElements checks record
   * values before snapshot replacement.
   *
   * @param elements - Complete flat collection of snapshot records to link.
   * @param rootElementIds - Complete ordered document root IDs.
   * @throws If lists are malformed, references are missing, ownership is duplicated,
   * a cycle exists, or a record is unreachable from the document roots.
   */
  validateHierarchy(elements: readonly ElementSnapshot[], rootElementIds: readonly string[]): void;
  /** @param id - Element identifier. @returns Whether the element exists. */
  hasElement(id: string): boolean;
  /**
   * Reads one flat element record without materializing descendant snapshots.
   *
   * The result includes ordered childIds; parentage is resolved by getParentId. Outside transactions,
   * repeated reads reuse the cached record until invalidated by document changes;
   * transaction reads bypass the cache. Mutating the returned object does not write
   * to storage and can corrupt cached reads, so treat it as read-only.
   *
   * @param id - Stable element ID to read.
   * @returns Detached node, or undefined when the ID is absent.
   */
  getElementNode(id: string): ElementNode | undefined;
  /**
   * Reads every stored element once as a flat record, including nested elements.
   *
   * Without a root, records follow collaborative map iteration order. With a root,
   * descendants follow tree traversal order and exclude that container. Neither
   * order is determined by stacking values.
   * Each contains childIds rather than recursive children. The array is cached outside
   * transactions until invalidated by document changes; treat it and its nodes as
   * read-only. Use getElements when recursive root trees are required.
   *
   * @param rootElementId - Container ID, or null/omitted for the complete document. Missing containers read as empty.
   * @returns Detached node array, empty when the selected tree contains no elements.
   */
  getElementNodes(rootElementId?: string | null): ElementNode[];
  /**
   * Observes element records and structural changes across the document.
   *
   * The callback runs after affected snapshots are invalidated, including for remote
   * and undo changes. Registration does not invoke it. Read the desired collection
   * inside the callback; it receives no snapshot argument.
   *
   * @param listener - Collection-change callback.
   * @returns Function that removes this exact listener.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Observes changes to one flat element record, including its child ID list.
   *
   * Insertion, deletion, and parent-list changes can also notify this listener.
   * A descendant's payload edit alone does not notify its parent node; use
   * subscribeElement for recursive observation. No initial callback is made, and
   * an ID need not exist when the subscription is registered.
   *
   * @param id - Stable element ID to observe.
   * @param listener - Callback invoked after the node cache is invalidated.
   * @returns Function that removes this exact listener.
   */
  subscribeElementNode(id: string, listener: () => void): () => void;
  /**
   * Observes changes to document roots, child lists, and element membership.
   * Payload-only edits do not notify this subscription. The callback runs after
   * hierarchy invalidation, at most once per observed transaction, with no initial call.
   * @param listener - Callback that can resolve current element placement.
   * @returns Function that removes this exact listener.
   */
  subscribeStructure(listener: () => void): () => void;
  /**
   * Observes changes to the set of stored element records in the document.
   *
   * Insertion and deletion notify this listener; editing props or moving existing
   * records between parents does not change global membership.
   * Registration does not invoke the callback.
   *
   * @param listener - Callback invoked when record membership changes.
   * @returns Function that removes this exact listener.
   */
  subscribeMembership(listener: () => void): () => void;
  /**
   * Creates a source-to-destination ID map for an immediate import.
   * Available source IDs are preserved, while IDs already used by this document
   * receive generated replacements. This does not insert or reserve any ID.
   * @param sourceIds - Source IDs in import order.
   * @returns Destination ID for every source ID.
   */
  createImportIdMap(sourceIds: readonly string[]): ReadonlyMap<string, string>;
  /**
   * Inserts an element and its child subtrees after validating portable document invariants.
   *
   * Supplied IDs are preserved, including identities reused after deletion or document
   * transfer; missing IDs are allocated. IDs must be unique throughout the destination
   * document and the new tree. Application preparation may register or validate external
   * database identities before shared document writes.
   *
   * The destination selects an existing parent or document roots; omission appends
   * to document roots. children creates new subtrees; childIds instead reparents
   * existing nonoverlapping subtrees while preserving their IDs and coordinates.
   * A defined children array cannot be combined with nonempty childIds.
   *
   * An element with children may omit frame to use the union of its direct children's frames
   * at insertion. Later child edits do not rewrite that stored frame. Elements without children
   * need explicit geometry. The root is placed at the destination anchor, or appended when no anchor is given;
   * supplied child order is preserved. All document writes occur in one
   * transaction after preparation and validation; external application side effects
   * are not rolled back by document validation.
   *
   * @param input - Type, finite stacking order, optional ID/props/children,
   * and frame in canvas coordinates when required.
   * @param destination - Optional parent and next-sibling anchor; defaults to appending to document roots.
   * @returns Detached normalized recursive subtree, with supplied IDs preserved and
   * missing IDs allocated. Use getElementNode for a flat record with childIds.
   * @throws If the destination is missing or invalid, an ID collides, input is cyclic or malformed,
   * geometry is invalid, existing children are missing, overlap, or would contain the destination
   * parent, or application identity preparation fails.
   */
  insertElement(input: ElementInput, destination?: ElementDestination): DocumentElement;
  /**
   * Patches one element's geometry, stacking order, or properties.
   *
   * Frame fields and props are shallow-merged; undefined property values remove those
   * keys. Identity, type, and child lists cannot be changed with a patch.
   * The complete resulting record is validated before transactional storage writes.
   *
   * @param id - Existing element ID to update.
   * @param patch - Only the mutable fields to change; omitted fields remain unchanged.
   * @returns Detached flat updated record with childIds, not a recursive subtree.
   * @throws If the element is missing or the resulting record is invalid.
   */
  updateElement(id: string, patch: ElementPatch): ElementNode;
  /**
   * Validates all patches before applying them together in one transaction.
   *
   * Frame fields and props are shallow-merged; undefined property values remove those
   * keys. Duplicate IDs observe earlier patches in the batch. Patches cannot change
   * identity, type, or child lists.
   *
   * @param updates - Element IDs and patches, applied in input order; an empty list is allowed.
   * @returns Detached flat records in input order, each reflecting its corresponding
   * patch, including intermediate results when the same ID occurs more than once.
   * @throws Before storage writes if any target is missing or any resulting record is invalid.
   */
  updateElements(updates: readonly ElementUpdate[]): ElementNode[];
  /**
   * Deletes one element and its entire element subtree in one transaction.
   *
   * The parent or document root list loses the deleted reference. Source blocks and
   * opaque references stored in other records' props are not changed.
   *
   * @param id - Subtree root to delete; a missing ID does nothing.
   */
  removeElement(id: string): void;
  /**
   * Deletes selected element subtrees together in one transaction.
   *
   * Overlapping selections and duplicate IDs are visited only once. References to
   * deleted records are removed from their parent or document root lists. Source blocks
   * and opaque references in other records' props are left unchanged.
   *
   * @param ids - Subtree root IDs to delete; missing IDs and an empty list are harmless.
   */
  removeElements(ids: readonly string[]): void;
  /**
   * Validates flat portable record values before destructive snapshot replacement.
   *
   * Checks IDs, duplicate records, type, geometry, stacking order, and portable props
   * without writing storage. Child references must exist, have at most one parent,
   * and contain no cycles. Document root placement is checked separately by
   * validateHierarchy against the complete root list.
   *
   * @param elements - Complete flat snapshot records to validate, not recursive trees.
   * @throws If any record is malformed, IDs are duplicated, or child lists contain
   * missing references, multiple parents, or cycles.
   */
  validateElements(elements: readonly ElementSnapshot[]): void;
  /**
   * Replaces all stored element records during snapshot loading.
   *
   * Record values are validated before clearing storage, then geometry and props are
   * normalized and child lists restored. Application insertion preparation is not run.
   * The caller must validate the complete hierarchy, restore matching document roots,
   * and wrap snapshot section replacement in its transaction. This method does not
   * independently validate or replace document root lists.
   *
   * @param elements - Complete flat snapshot collection replacing all existing records;
   * an empty array removes every element.
   * @throws Before clearing storage if record validation or normalization fails.
   */
  loadElements(elements: readonly ElementSnapshot[]): void;
  /**
   * Restores ordered document root IDs inside the caller's snapshot transaction.
   * @param ids - Complete roots, validated against the replacement element records.
   */
  loadRootIds(ids: readonly string[]): void;
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
  version: 9;
  blocks: Block[];
  elements: ElementSnapshot[];
  /** Ordered document element roots; every other element is reachable through childIds. */
  rootElementIds: string[];
  pluginData?: Record<string, unknown>;
}

/** Sections received from persistence that should replace only supplied state. */
export interface SnapshotUpdate {
  version: 9;
  blocks?: Block[];
  elements?: ElementSnapshot[];
  /** Complete replacement root list; omitted preserves current roots, including their order. */
  rootElementIds?: string[];
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
   * Produces a lossless schema-v8 snapshot.
   *
   * @returns Detached blocks, elements, and document plugin data.
   */
  getSnapshot(): Snapshot;

  /**
   * Replaces only supplied schema-v8 snapshot sections.
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

/** Persisted element fields; placement is represented by document root and child lists. */
export type ElementSnapshot = ElementNode;

/** Destination of an element subtree; coordinates remain relative to the canvas. */
export interface ElementDestination {
  /** Null selects the document root list; otherwise selects this element's child list. */
  parentId: string | null;
  /** Optional direct sibling before which to insert; omitted to append. */
  beforeId?: string;
}
