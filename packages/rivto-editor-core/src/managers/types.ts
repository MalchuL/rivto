/**
 * Structural contracts for every manager exposed by DocumentEditorAPI.
 * Concrete manager classes implement these interfaces; consumers depend only
 * on the contracts collected here.
 */
import type {
  EditorBlock,
  EditorBlockInput,
  EditorBlockNode,
  EditorBlockPatch,
  EditorBlockUpdate,
  EditorElementNode,
  EditorElement,
  EditorElementInput,
  EditorElementPatch,
  EditorElementUpdate,
} from "../editor/model";
import type { ElementDestination, BlockDestination } from "@chulane/document-model";
import type { EditorMode } from "../editor/types";
import type { BlockProcessor } from "./block-manager/block-pipe";
import type { BlockMoveRequest, BlockStructuralBehavior } from "../block-behaviors/types";
import type { BlockImportOptions, BlockPrepareErrorHandler } from "./block-manager/types";
import type { BlockListPropsManagerApi } from "./block-list-props-manager";
import type { BlockDefinition } from "./block-registry-manager/types";
import type { ClipboardBundle, ClipboardPasteInput } from "./clipboard-manager/clipboard-data";
import type { PasteStrategyRegistry } from "./clipboard-manager/strategies";
import type { ElementProcessor } from "./element-manager/element-pipe";
import type { ResolvedSelection } from "./selection-manager/resolved-selection";
import type { EditorPosition, Selection } from "./selection-manager/selection";

/** Function accepted by the command registry. */
export type CommandHandler = (payload?: unknown) => unknown;

/** Ownership handle for one command registration. */
export interface RegisteredCommand {
  /** Stable registered command ID. */
  readonly name: string;
  /** @param payload - Optional command data. @returns The handler result. */
  execute(payload?: unknown): unknown;
  /** @returns No value after releasing this registration. */
  dispose(): void;
}

/** Public command registry contract. */
export interface CommandRegistryApi {
  readonly lastExecuted: string | null;
  /**
   * Registers a command handler and returns the handle that releases it.
   *
   * @param name - Unique, non-empty command ID.
   * @param handler - Runtime command implementation.
   * @returns Ownership handle for this exact registration.
   * @throws If the command name is empty or already registered.
   */
  register(name: string, handler: CommandHandler): RegisteredCommand;
  /**
   * Reports whether a command name currently resolves to a handler.
   *
   * @param name - Command ID to inspect.
   * @returns `true` when a handler is registered.
   */
  has(name: string): boolean;
  /** @param name - Command ID. @returns No value. */
  remove(name: string): void;
  /**
   * Executes a registered command and notifies subscribers after success.
   *
   * @param name - Command ID to execute.
   * @param payload - Optional runtime payload passed to the handler.
   * @returns The command handler result.
   * @throws If no handler owns the command name, or if the handler throws.
   */
  execute(name: string, payload?: unknown): unknown;
  /**
   * Subscribes to successful command executions.
   *
   * @param listener - Callback called after a command handler completes.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void;
  /** @returns No value after clearing registrations and listeners. */
  clear(): void;
}

/** Result of importing a detached block forest. */
export interface ImportedBlockForest {
  /** Complete persisted destination roots in source order. */
  readonly roots: EditorBlock[];
  /** Source-to-destination ID mapping. */
  readonly idMap: ReadonlyMap<string, string>;
}

/** Public typed block-operation contract. */
export interface BlockManagerApi {
  /** Whether the boundary block itself is visible and protected. */
  readonly includeRoot: boolean;
  /**
   * Checks whether the block can be removed through this manager.
   *
   * @param id - Block identifier to inspect.
   * @returns Whether the block exists and is not protected by the manager's boundary.
   */
  canRemove(id: string): boolean;
  /**
   * Checks whether the block can be moved out of its current parent.
   *
   * @param id - Block identifier to inspect.
   * @returns Whether the block has a parent and can leave it within this manager's boundary.
   */
  canOutdent(id: string): boolean;
  /**
   * Evaluates editor-local structural move permissions for detached roots.
   *
   * @param request - Moved roots and destination in this editor's document.
   * @returns False for an invalid destination, empty selection, or a behavior veto.
   */
  canMove(request: BlockMoveRequest): boolean;
  /** Monotonic active-document block revision. */
  readonly revision: number;
  /** @param processor - Editor-owned processor. @returns Its disposer. */
  registerProcessor(processor: BlockProcessor): () => void;
  /** @param id - Block ID. @returns Whether the block exists. */
  hasBlock(id: string): boolean;
  /** @param id - Block ID. @returns Detached subtree or undefined. */
  getBlock(id: string): EditorBlock | undefined;
  /**
   * Resolves one placed block without recursively materializing descendants.
   *
   * @param id - Persisted block identifier to resolve.
   * @returns Detached non-recursive block fields, or undefined when absent.
   */
  getBlockNode(id: string): EditorBlockNode | undefined;
  /** @returns Complete detached root forest. */
  getBlocks(): EditorBlock[];
  /**
   * Reads the ordered block IDs at the root of this manager’s scope.
   *
   * @returns Root identities in document order, or an empty list for an empty scope.
   */
  getRootIds(): readonly string[];
  /** @param ids - Candidate IDs. @returns Unique placed IDs in document order, omitting missing records. */
  getOrderedIds(ids: Iterable<string>): string[];
  /** @param id - Block ID. @param listener - Change listener. @returns Its disposer. */
  subscribeBlock(id: string, listener: () => void): () => void;
  /**
   * Subscribes to one block's own fields and direct child IDs.
   *
   * @param id - Block identifier to observe.
   * @param listener - Callback invoked after relevant changes.
   * @returns Function that removes the subscription.
   */
  subscribeBlockNode(id: string, listener: () => void): () => void;
  /** @param listener - Root-list listener. @returns Its disposer. */
  subscribeRootIds(listener: () => void): () => void;
  /** @param listener - Structure listener. @returns Its disposer. */
  subscribeStructure(listener: () => void): () => void;
  /**
   * Applies definitions, list-property policy, and registered processors to
   * every node, then validates the complete detached forest.
   *
   * @param input - Detached block forest to prepare atomically.
   * @param onError - Optional handler that supplies one replacement for a failed node.
   * @returns Recursively copied forest ready for insertion.
   */
  prepareInput(
    input: readonly (EditorBlock | EditorBlockInput)[],
    onError?: BlockPrepareErrorHandler,
  ): EditorBlockInput[];
  /** @param id - Parent ID. @returns True when the block has at least one child. */
  hasChildren(id: string): boolean;
  /** @param id - Block ID. @returns Parent ID, null, or undefined. */
  getParentId(id: string): string | null | undefined;
  /** @param id - Block ID. @returns True when the block exists and has no parent. */
  isRootBlock(id: string): boolean;
  /** @param block - Creation input. @param destination - Actual parent and optional next sibling. @returns Complete persisted block. */
  insertBlock(block: EditorBlockInput, destination?: BlockDestination): EditorBlock;
  /** @param parentId - Parent identity. @returns Its direct child IDs or empty when absent. */
  getChildIds(parentId: string): readonly string[];
  /** @param afterId - Sibling to follow, null to prepend, or omitted to append. @returns Document destination. @throws For a missing sibling. */
  getInsertionDestinationAfter(afterId?: string | null): BlockDestination;
  /**
   * Prepares and imports a forest in one history batch.
   *
   * @param blocks - Complete copied roots or creation inputs.
   * @param destination - Actual parent and optional next sibling.
   * @param options - Optional recovery, identity mapping, and preservation requirements.
   * @param options.onError - Optional one-shot node recovery.
   * @param options.ids - Optional preallocated source-to-destination ID mapping.
   * @param options.preserveIds - Whether to reject missing, conflicting, or changed source IDs.
   * @returns Imported roots and their source-to-destination identity mapping.
   * @throws If preparation fails or requested source identities cannot be preserved.
   */
  importForest(
    blocks: readonly (EditorBlock | EditorBlockInput)[],
    destination?: BlockDestination,
    options?: BlockImportOptions,
  ): ImportedBlockForest;
  /**
   * Applies supplied mutable fields to one block.
   *
   * @param id - Block identifier to update.
   * @param patch - Mutable fields to validate and apply.
   * @returns Updated persisted fields without recursively materializing descendants.
   */
  updateBlock(id: string, patch: EditorBlockPatch): EditorBlockNode;
  /**
   * Applies several identified block patches atomically.
   *
   * @param updates - Ordered block identifiers and patches.
   * @returns Updated persisted fields without descendants, in input order.
   */
  updateBlocks(updates: readonly EditorBlockUpdate[]): EditorBlockNode[];
  /** @param id - Block ID. @param keys - Keys to delete. @returns Whether deletion applied. */
  deleteListProps(id: string, keys: readonly string[]): boolean;
  /** @param updates - Identified key deletions. @returns No value. */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): void;
  /**
   * Clears content and descendants while preserving one block's identity.
   *
   * @param id - Block identifier to retain and clear.
   * @returns No value.
   */
  clearBlock(id: string): void;
  /**
   * Converts one block to another registered native type.
   *
   * Processor changes to list properties are validated and committed with the
   * type change; unrelated existing properties remain intact.
   *
   * @param id - Block identifier to convert.
   * @param type - Registered destination type.
   * @returns No value.
   */
  setBlockType(id: string, type: string): void;
  /** @param id - Block ID to remove. @returns No value. */
  removeBlock(id: string): void;
  /**
   * Consults structural behaviors and removes the requested subtrees when they defer.
   *
   * @param ids - Selected subtree roots in their requested order.
   * @returns True when generic removal ran; false when a behavior handled or rejected it.
   * @throws If a behavior or document mutation fails.
   */
  removeBlocks(ids: readonly string[]): boolean;
  /**
   * Replaces selected text across blocks and removes the trailing block subtrees.
   *
   * @param firstId - Block receiving the resulting text.
   * @param trailingIds - Following selected blocks to remove.
   * @param content - Remaining prefix and suffix joined by the caller.
   * @returns After the trailing subtrees and first block are updated.
   * @throws If block validation, transition hooks, or a document mutation fails.
   */
  replaceTextSelection(firstId: string, trailingIds: readonly string[], content: string): void;
  /**
   * Appends a source block's content and children into a surviving target.
   *
   * @param targetId - Block that remains after the merge.
   * @param sourceId - Block transferred and removed by the merge.
   * @returns Target content offset where source content begins.
   */
  mergeBlocks(targetId: string, sourceId: string): number;
  /**
   * Moves one block relative to a destination.
   *
   * @param id - Block identifier to move.
   * @param targetId - Destination, or null for the sibling-list start.
   * @param position - Placement before, after, or inside the destination.
   * @returns No value.
   */
  moveBlock(id: string, targetId: string | null, position?: "before" | "after" | "inside"): void;
  /**
   * Moves selected subtree roots from any parents in canonical document order.
   *
   * Selected descendants of selected ancestors move only with their ancestor.
   * All source IDs are checked before writing; the group forms one undo item.
   *
   * @param ids - Source identities in any order; duplicate identities are ignored.
   * @param targetId - Destination anchor; null prepends within each source's current sibling list.
   * @param position - Placement relative to the anchor; defaults to after.
   * @returns The validated group has moved, or no change for an empty group.
   * @throws Before writes for missing sources, stale targets or a destination within a selected subtree.
   */
  moveBlocks(
    ids: readonly string[],
    targetId: string | null,
    position?: "before" | "after" | "inside",
  ): void;
  /**
   * Nests one block under its previous sibling.
   *
   * @param id - Block identifier to indent.
   * @returns No value.
   */
  indentBlock(id: string): void;
  /**
   * Applies registered outline behaviors before indenting a group.
   *
   * @param ids - Block IDs in selection order.
   * @returns True when the leading block exists in the scope, including handled no-ops.
   * @throws If a behavior or delegated operation fails.
   */
  indentBlocks(ids: readonly string[]): boolean;
  /**
   * Moves one block out of its parent and adopts following siblings.
   *
   * @param id - Block identifier to outdent.
   * @returns No value.
   */
  outdentBlock(id: string): void;
  /**
   * Applies registered outline behaviors before outdenting a group.
   *
   * @param ids - Block IDs in selection order.
   * @returns True when the leading block exists in the scope, including handled no-ops.
   * @throws If a behavior or delegated operation fails.
   */
  outdentBlocks(ids: readonly string[]): boolean;
  /**
   * Sets or removes one validated native block property.
   *
   * @param id - Owning block identifier.
   * @param key - Native property key.
   * @param value - Portable value, or undefined to remove the property.
   * @returns No value.
   */
  setBlockProp(id: string, key: string, value: unknown): void;
  /**
   * Sets or removes one block plugin-data namespace.
   *
   * @param id - Owning block identifier.
   * @param pluginId - Stable plugin namespace.
   * @param value - Portable value, or undefined to remove the namespace.
   * @returns No value.
   */
  setBlockPluginData(id: string, pluginId: string, value: unknown): void;
}

export type { BlockListPropsManagerApi };

/** Native definition reads and preparation used by block commands. */
export interface BlockPreparationRegistry {
  /**
   * Checks whether creation rules are registered for a native type.
   *
   * @param type - Persisted block discriminator.
   * @returns Whether the registry contains its definition.
   */
  has(type: string): boolean;
  /**
   * Applies definition defaults and validates creation properties.
   *
   * @param input - Caller-owned creation data containing a registered type.
   * @returns Detached input with definition defaults and validated props.
   * @throws If the type is unknown or its property schema rejects the data.
   */
  prepare(input: EditorBlockInput): EditorBlockInput;
  /**
   * Prepares properties when an existing block changes native type.
   *
   * Existing values and unknown extension properties survive conversion. A
   * destination-owned field that no longer satisfies its Zod field schema is
   * replaced with that field's registered default. Nested objects are merged
   * first and validated as one destination field.
   *
   * @param type - Registered destination native type.
   * @param current - Detached properties owned by the existing block.
   * @returns Merged, repaired, and validated destination properties.
   * @throws If the type is unknown or invalid data has no valid default.
   */
  prepareTypeChange(type: string, current: Record<string, unknown>): Record<string, unknown>;
  /**
   * Validates a complete property object for a stored block.
   *
   * Unknown types pass through unchanged so block data remains recoverable when
   * an optional plugin is not installed.
   *
   * @param type - Persisted native block type.
   * @param props - Complete candidate property object.
   * @returns Validated properties or the original unknown-type properties.
   */
  validate(type: string, props: Record<string, unknown>): Record<string, unknown>;
}

/** Public block-definition and structural-behavior registration contract. */
export interface BlockRegistryManagerApi extends BlockPreparationRegistry {
  /**
   * Registers editor-local structural behavior for parent-child changes.
   *
   * The same instance at the same priority runs once until every registration is released.
   *
   * Behavior registration does not notify native-definition subscribers.
   *
   * @param behavior - Synchronous structural behavior, independent of presentation.
   * @param priority - Higher-priority behaviors run first; defaults to zero.
   * @returns Idempotent disposer for this registration.
   * @throws If priority is not finite.
   */
  registerBehavior(behavior: BlockStructuralBehavior, priority?: number): () => void;
  /**
   * Registers the exact complete native definition until its disposer runs.
   *
   * Initial observer failures unregister the definition before escaping. If a
   * rollback observer also fails, both errors are reported after removal.
   *
   * @param definition - Complete definition with a unique, non-empty native type.
   * @returns Idempotent disposer removing this exact definition and notifying observers.
   * @throws If the type is invalid or duplicated, or a lifecycle observer throws.
   * Initial and rollback observer failures are combined in an AggregateError.
   */
  defineBlock(definition: BlockDefinition): () => void;
  /**
   * Observes additions and removals of native block definitions.
   *
   * @param listener - Callback invoked after definition changes.
   * @returns Idempotent disposer removing the listener.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Resolves a registered definition without inventing a fallback type.
   *
   * @param type - Persisted native type to resolve.
   * @returns Its definition, or `undefined` for a losslessly stored unknown type.
   */
  get(type: string): BlockDefinition | undefined;
}

/** Document-wide element commands; canvas handles expose restricted operations. */
export interface ElementManagerApi {
  /**
   * Reads an element's direct child IDs in stored sibling order, excluding descendants.
   *
   * The parent itself is excluded. Use getRootIds() to read document roots.
   *
   * @param parentId - Stable ID of the element whose direct children should be read.
   * @returns Read-only child list, with stable identity while its contents are unchanged;
   * an empty list when the parent is missing or has no children.
   */
  getChildIds(parentId: string): readonly string[];
  /**
   * Reads one element with its complete recursive child tree.
   *
   * Children follow their stored sibling order. Outside a CRDT transaction, repeated
   * reads reuse cached objects until the node or a descendant changes; unaffected
   * branches retain their objects. Transaction reads bypass that cache. Treat the
   * returned snapshot as read-only: changing it does not update the document.
   *
   * @param id - Stable ID of the subtree root, which may itself be nested.
   * @returns Detached tree with children, or undefined when the ID is absent or outside a panel's boundary.
   * Use getElementNode when only this record and its child IDs are needed.
   */
  getElement(id: string): EditorElement | undefined;
  /**
   * Reads the root element trees of the document or panel, including their nested children.
   *
   * Roots follow the document root list; descendants follow each element's child list.
   * Descendants appear inside their parents, rather than as additional array entries.
   * Outside transactions, the array is cached until a contributing element changes,
   * and unchanged subtrees reuse their objects. Treat all returned values as read-only.
   *
   * A document manager starts at document roots. A panel starts at its selected
   * container's children and returns an empty array when that container is missing.
   * @returns Detached recursive roots, or an empty array when there are no elements.
   */
  getElements(): EditorElement[];
  /**
   * Observes changes to one element and its complete subtree.
   *
   * Notifications include descendant edits, insertion, deletion, and changes to tree
   * placement. Moves invalidate both old and new ancestors before listeners run.
   * Registering does not invoke the listener; a currently missing ID can be observed.
   *
   * The subscription remains bound to the document used at registration and is
   * also released when this editor manager is destroyed.
   *
   * @param id - Stable ID of the subtree root to observe.
   * @param listener - Callback that can reread the current tree after invalidation.
   * @returns Function that removes this listener.
   */
  subscribeElement(id: string, listener: () => void): () => void;
  /**
   * Reads the ordered direct child IDs of an element or document root IDs, excluding descendants.
   *
   * A document manager returns document roots; a panel returns its selected
   * container's children and excludes that container. getChildIds(parentId) reads
   * one visible parent's direct children.
   * @returns Read-only root list, with stable identity while its contents are unchanged;
   * an empty list when the document contains no root elements.
   */
  getRootIds(): readonly string[];
  /**
   * Resolves an element's direct parent from document roots and child lists.
   *
   * @param id - Stable element ID to locate.
   * @returns Parent element ID, null at this manager's root, or undefined when absent or outside a panel.
   */
  getParentId(id: string): string | null | undefined;
  /**
   * Moves selected subtrees together, preserving IDs and canvas-relative geometry.
   * Selecting an ancestor and its descendant moves the ancestor only. The model
   * validates all references before writing; the complete move is transactional.
   * @param ids - Existing elements in destination order; duplicate IDs are ignored.
   * @param destination - Parent (null for this manager's roots) and optional next sibling.
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
   * Registers or replaces an editor-owned element validation or transformation step.
   *
   * The pipeline belongs to this editor, not shared document state, and remains
   * available across its document operations. Insertions process every new node;
   * updates process the merged record but write only fields requested by the patch.
   * Processors also run on new grouping records. Remote writes and snapshot loading
   * do not pass through this editor pipeline.
   *
   * Processors with lower priority values run first; registering the same ID replaces
   * its previous step.
   *
   * @param processor - Named processing step with its priority and callback.
   * @returns Idempotent function that unregisters this step. Destroying the manager
   * also removes remaining registered processors.
   * @throws If the processor ID is empty.
   */
  registerProcessor(processor: ElementProcessor): () => void;
  /** @param id - Element ID. @returns Whether the element exists. */
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
   * @returns Detached node, or undefined when the ID is absent or outside a panel.
   */
  getElementNode(id: string): EditorElementNode | undefined;
  /**
   * Reads every stored element once as a flat record, including nested elements.
   *
   * Records follow collaborative map iteration order and include every nested element.
   * Structural parentage remains available through getParentId and childIds. The
   * collection order is independent of stacking values and hierarchy traversal.
   * Each contains childIds rather than recursive children. The array is cached outside
   * transactions until invalidated by document changes; treat it and its nodes as
   * read-only. Use getElements when recursive root trees are required.
   *
   * The document manager observes the complete document. A panel includes only
   * descendants of its selected container; a missing container produces an empty list.
   * @returns Detached node array, empty when the selected tree contains no elements.
   */
  getElementNodes(): EditorElementNode[];
  /**
   * Observes element records and structural changes in this manager's scope.
   *
   * The callback runs after affected snapshots are invalidated, including for remote
   * and undo changes. Registration does not invoke it. Read the desired collection
   * inside the callback; it receives no snapshot argument.
   *
   * The subscription remains bound to the document used at registration and is
   * also released when this editor manager is destroyed.
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
   * The subscription remains bound to the document used at registration and is
   * also released when this editor manager is destroyed.
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
   * Observes changes to stored element membership in this manager's scope.
   *
   * Insertion and deletion notify this listener; editing props or moving existing
   * records between parents does not change global membership. A panel also
   * notifies when a move changes its ordered subtree membership.
   * Registration does not invoke the callback.
   *
   * The subscription remains bound to the document used at registration and is
   * also released when this editor manager is destroyed.
   *
   * @param listener - Callback invoked when record membership changes.
   * @returns Function that removes this exact listener.
   */
  subscribeMembership(listener: () => void): () => void;
  /**
   * Inserts an element and its child subtrees after validating portable document invariants.
   *
   * Supplied IDs are preserved, including identities reused after deletion or document
   * transfer; missing IDs are allocated. IDs must be unique throughout the destination
   * document and the new tree. Application preparation may register or validate external
   * database identities before shared document writes.
   *
   * The destination selects an existing parent or this manager's roots; omission appends
   * to those roots. For a panel, null selects the selected container's children.
   * children creates new subtrees; childIds instead reparents
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
   * Editor processors run on the root and recursively on every new child, including
   * children introduced by a processor. Existing childIds are not reprocessed. The
   * operation is wrapped in a history batch, and processor errors propagate before
   * the document manager inserts records.
   *
   * @param input - Type, finite stacking order, optional ID/props/children,
   * and frame in canvas coordinates when required.
   * @param destination - Optional parent and next-sibling anchor; defaults to appending to this manager's roots.
   * @returns Detached normalized recursive subtree, with supplied IDs preserved and
   * missing IDs allocated. Use getElementNode for a flat record with childIds.
   * @throws If the destination is missing or invalid, an ID collides, input is cyclic or malformed,
   * geometry is invalid, existing children are missing, overlap, or would contain the destination
   * parent, or application identity preparation fails.
   */
  insertElement(input: EditorElementInput, destination?: ElementDestination): EditorElement;
  /**
   * Creates a source-to-destination ID map for an immediate import.
   *
   * Available IDs are preserved; collisions anywhere in the destination document get
   * new IDs. Use the map to rewrite child lists and references in props before insertion.
   * This operation does not insert elements or reserve the returned identities.
   *
   * @param sourceIds - Stable source element IDs in import order.
   * @returns Destination identity for each source ID.
   */
  createImportIdMap(sourceIds: readonly string[]): ReadonlyMap<string, string>;
  /**
   * Patches one element's geometry, stacking order, or properties.
   *
   * Frame fields and props are shallow-merged; undefined property values remove those
   * keys. Identity, type, and child lists cannot be changed with a patch.
   * The complete resulting record is validated before transactional storage writes.
   *
   * Editor processors run on the merged record before validation. Only fields
   * requested by the patch are written back; processing does not change hierarchy.
   *
   * @param id - Existing element ID to update.
   * @param patch - Only the mutable fields to change; omitted fields remain unchanged.
   * @returns Detached flat updated record with childIds, not a recursive subtree.
   * @throws If the element is missing or processing or resulting-record validation fails.
   */
  updateElement(id: string, patch: EditorElementPatch): EditorElementNode;
  /**
   * Validates all patches before applying them together in one transaction.
   *
   * Frame fields and props are shallow-merged; undefined property values remove those
   * keys. Duplicate IDs observe earlier patches in the batch. Patches cannot change
   * identity, type, or child lists.
   *
   * Editor processors run on the merged record before validation. Only fields
   * requested by the patch are written back; processing does not change hierarchy.
   *
   * @param updates - Element IDs and patches, applied in input order; an empty list is allowed.
   * @returns Detached flat records in input order, each reflecting its corresponding
   * patch, including intermediate results when the same ID occurs more than once.
   * @throws Before storage writes if any target is missing or processing or resulting-record validation fails.
   */
  updateElements(updates: readonly EditorElementUpdate[]): EditorElementNode[];
  /**
   * Deletes one element and its entire element subtree in one transaction.
   *
   * The parent or document root list loses the deleted reference. Source blocks and
   * opaque references stored in other records' props are not changed.
   *
   * @param id - Subtree root to delete; a missing ID is ignored by the document
   * manager but rejected by a panel, as are IDs outside its boundary.
   * @returns After deletion or the document manager's missing-ID no-op.
   * @throws If a panel target is missing or outside its boundary.
   */
  removeElement(id: string): void;
  /**
   * Deletes selected element subtrees together in one transaction.
   *
   * Overlapping selections and duplicate IDs are visited only once. References to
   * deleted records are removed from their parent or document root lists. Source blocks
   * and opaque references in other records' props are left unchanged.
   *
   * @param ids - Subtree root IDs to delete; an empty list is harmless. The document
   * manager ignores missing IDs, while a panel rejects missing or outside targets.
   * @returns After the requested subtrees are removed.
   * @throws If any panel target is missing or outside its boundary.
   */
  removeElements(ids: readonly string[]): void;
}

/** Public clipboard-operation contract. */
export interface ClipboardManagerApi {
  /** Ordered paste strategies owned by this clipboard manager. */
  readonly pasteStrategies: PasteStrategyRegistry;
  /** @param selection - Optional selection override. @returns Clipboard bundle or undefined. */
  copy(selection?: Selection): ClipboardBundle | undefined;
  /**
   * Copies characters covered by an explicit selection, excluding collapsed carets.
   *
   * @param selection - One block selection to copy.
   * @returns Partial-text bundle, or undefined for a caret.
   */
  copyText(selection: Selection): ClipboardBundle | undefined;
  /** @returns Copied bundle or undefined after deleting the selection. */
  cut(): ClipboardBundle | undefined;
  /** @param input - Clipboard flavors and placement. @returns Resulting caret or undefined. */
  paste(input?: ClipboardPasteInput): EditorPosition | undefined;
}

/** Public local mode contract. */
export interface ModeManagerApi {
  /**
   * Reads the current editor mode.
   *
   * @returns Active local presentation mode.
   */
  get(): EditorMode;
  /** @param mode - Next mode. @returns No value. */
  set(mode: EditorMode): void;
  /**
   * Subscribes to mode changes.
   *
   * @param listener - Callback called after the active mode changes.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void;
}

/** Public local selection contract. */
export interface SelectionManagerApi {
  /** @returns Detached current selection. */
  get(): Selection | undefined;
  /** @returns Stable selection snapshot. */
  snapshot(): Selection | undefined;
  /**
   * Reports whether one member is stored as complete coverage (`start: 0`, `end: -1`).
   * Other members of the same selection may still be partial text ranges.
   *
   * @param id - Stable block ID.
   * @returns Whether that block should show structural selection chrome.
   */
  isBlockSelected(id: string): boolean;
  /**
   * Reports whether the generic selection contains an element ID.
   *
   * @param id - Stable first-class element ID.
   * @returns Whether the element is selected.
   */
  isElementSelected(id: string): boolean;
  /** @param selection - Optional selection override. @returns Resolved live selection. */
  resolveBlockSelection(selection?: Selection): ResolvedSelection | undefined;
  /** @param selection - New local selection. @returns No value. */
  set(selection: Selection): void;
  /** @returns No value after deleting selected content. */
  delete(): void;
  /** @returns No value after clearing selection. */
  clear(): void;
  /**
   * Subscribes to selection changes.
   *
   * @param listener - Callback invoked after an effective change.
   * @returns Function that removes the listener.
   */
  subscribe(listener: () => void): () => void;
}

/** Undo grouping borrowed by commands that write to the same document. */
export interface HistoryBatch {
  /**
   * Runs a synchronous mutation group within the document history boundary.
   *
   * @param operation - Reads and writes that belong to the same operation.
   * @returns The value returned by the operation.
   * @throws Propagates failures from the operation.
   */
  batchUpdates<Result>(operation: () => Result): Result;
}

/** Public document-history and transaction contract. */
export interface HistoryManagerApi extends HistoryBatch {
  /**
   * Groups synchronous mutations into one transaction excluded from undo history.
   *
   * @param operation - Synchronous editor work to execute without an undo item.
   * @returns Value returned by the operation.
   */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result;
  /** @returns No value after undoing. */
  undo(): void;
  /** @returns No value after redoing. */
  redo(): void;
  /** @returns No value after clearing history. */
  clear(): void;
  /** @returns No value after ending the current capture group. */
  stopCapturing(): void;
}
