import type { EditorElement, EditorElementInput, EditorElementNode, EditorElementPatch, EditorElementUpdate } from '@chulane/rivto';
import type { PanelDestination } from './panel-destination';
/** Reads and changes only descendants of the panel's element root. Existing outside targets are rejected before mutation. */
export interface PanelElementsAPI {
  /**
   * Reads one element with its complete recursive child tree.
   *
   * Children follow their stored sibling order. Outside a CRDT transaction, repeated
   * reads reuse cached objects until the node or a descendant changes; unaffected
   * branches retain their objects. Transaction reads bypass that cache. Treat the
   * returned snapshot as read-only: changing it does not update the document.
   *
   * @param id - Stable ID of the subtree root, which may itself be nested.
   * @returns Detached tree with children, or undefined when the ID is absent or outside the panel.
   * Use getElementNode when only this record and its child IDs are needed.
   */
  getElement(id: string): EditorElement | undefined;

  /**
   * Reads the root element trees of the document or children of one element.
   *
   * Roots follow the document root list or the selected element's child list.
   * Descendants appear inside their parents, rather than as additional array entries.
   * Outside transactions, the array is cached until a contributing element changes,
   * and unchanged subtrees reuse their objects. Treat all returned values as read-only.
   *
   * The panel's fixed element container selects these roots; a missing container reads as empty.
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
   * The fixed panel container is excluded; a null container selects the document root list.
   * @returns Read-only root list, with stable identity while its contents are unchanged;
   * an empty list when the selected container is missing or has no children.
   */
  getRootIds(): readonly string[];

  /**
   * Resolves an element's direct parent from document roots and child lists.
   *
   * @param id - Stable element ID to locate.
   * @returns Panel-relative parent ID, null at the panel root, or undefined when absent or outside.
   */
  getParentId(id: string): string | null | undefined;

  /**
   * Moves selected subtrees together, preserving IDs and canvas-relative geometry.
   * Selecting an ancestor and its descendant moves the ancestor only. The model
   * validates all references before writing; the complete move is transactional.
   * @param ids - Existing elements in destination order; duplicate IDs are ignored.
   * @param destination - Panel root or included parent and optional next sibling; omission appends to panel roots.
   * @throws If an element or destination is missing, the anchor is not a destination
   * sibling, or the move would create a cycle.
   */
  moveElements(ids: readonly string[], destination?: PanelDestination): void;

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

  /** @param id - Element ID. @returns Whether the element exists inside the panel. */
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
   * @returns Detached node, or undefined when the ID is absent or outside the panel.
   */
  getElementNode(id: string): EditorElementNode | undefined;

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
   * The selected panel subtree is fixed; its missing container always reads as an empty collection.
   * @returns Detached node array, empty when the selected tree contains no elements.
   */
  getElementNodes(): EditorElementNode[];

  /**
   * Observes element records and structural changes inside the panel element tree.
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
   * Observes changes to the ordered list of element IDs inside the panel.
   *
   * Insertion, deletion, moves into or out of the panel, and reordering its traversal
   * notify this listener. Editing only props does not change this local list.
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
   * The destination selects an included parent or panel roots; omission appends
   * to panel roots. children creates new subtrees; childIds instead reparents
   * existing nonoverlapping local subtrees while preserving their IDs and coordinates.
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
   * @param destination - Optional parent and next-sibling anchor; defaults to appending to document roots.
   * @returns Detached normalized recursive subtree, with supplied IDs preserved and
   * missing IDs allocated. Use getElementNode for a flat record with childIds.
   * @throws If the destination is missing or invalid, an ID collides, input is cyclic or malformed,
   * geometry is invalid, existing children are missing, overlap, or would contain the destination
   * parent, or application identity preparation fails.
   */
  insertElement(input: EditorElementInput, destination?: PanelDestination): EditorElement;

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
/** @param parentId - Local element parent. @returns Direct child IDs, empty when absent. */
getChildIds(parentId: string): readonly string[];
}
