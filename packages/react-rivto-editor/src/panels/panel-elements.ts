import type { DocumentModel } from "@chulane/document-model";
import type { EditorElementInput, EditorElementPatch, EditorElementUpdate, ElementManagerApi } from "@chulane/rivto";
import type { PanelDestination } from './panel-destination';
import type { PanelElementsAPI } from './panel-elements-api';

/** Applies element operations to one element subtree while reusing the editor's processing pipeline. */
export class PanelElements implements PanelElementsAPI {
  /**
   * Binds subtree reads and commands to the shared document and editor pipeline.
   *
   * Construction does not create or validate the container. Null selects document roots. Reads of a missing root
   * return empty or missing values; mutations validate their targets when invoked.
   *
   * @param elements - Editor element manager operating on the same document.
   * @param document - Model containing the shared element hierarchy.
   * @param rootElementId - Fixed container ID, or null for the complete document tree.
   */
  constructor(private readonly elements: ElementManagerApi, private readonly document: DocumentModel, readonly rootElementId: string | null) {}

  /**
   * Reads this element subtree's root IDs, excluding nested children.
   *
   * @returns Ordered read-only IDs with stable identity while unchanged, or an empty
   * list when the root is missing or has no roots.
   */
  getRootIds(): readonly string[] { return this.document.elements.getRootIds(this.rootElementId); }
  /**
   * Finds the direct parent of an element belonging to this element subtree.
   *
   * @param id - Stable element ID to inspect.
   * @returns Panel-relative parent ID, null at the panel root, or undefined when missing or outside this subtree.
   */
  getParentId(id: string): string | null | undefined {
    if (!this.hasElement(id)) return undefined;
    const parentId = this.elements.getParentId(id);
    return parentId === this.rootElementId ? null : parentId;
  }
  /**
   * Moves local subtrees to a parent or root position within this element subtree.
   *
   * IDs and canvas-relative geometry are preserved. Duplicate IDs are ignored, and
   * selecting an ancestor with its descendant moves the ancestor only. Writes share
   * one transaction and history batch through the editor manager.
   *
   * @param ids - Existing local elements in destination order.
   * @param destination - Local parent or `{ root: true }` for the panel root, and optional next sibling;
   * omitting beforeId appends to that list.
   * @throws Before writing if any target is missing or outside this element subtree, the
   * destination or anchor is invalid, or the move would create a cycle.
   */
  moveElements(ids: readonly string[], destination: PanelDestination = { root: true }): void {
    ids.forEach((id) => this.requireElement(id));
    if ("root" in destination ? destination.root !== true : typeof destination.parentId !== "string") throw new Error("Panel destination requires root: true or a parent ID");
    const parentId = "root" in destination ? this.rootElementId : destination.parentId;
    if (parentId !== this.rootElementId && parentId !== null) this.requireElement(parentId);
    this.requireRoot();
    this.elements.moveElements(ids, { parentId, beforeId: destination.beforeId });
  }
  /**
   * Promotes a local element's children at its position and deletes only the parent.
   *
   * Child IDs, sibling order, and canvas-relative frames remain unchanged. Any parent
   * type is accepted; a leaf is simply deleted. Writes share one history operation.
   *
   * @param id - Existing element in this element subtree to remove.
   * @returns Promoted child IDs in order, or an empty array for a removed leaf.
   * @throws If the root or element is missing, or the element is outside this subtree.
   */
  removeElementAndPromoteChildren(id: string): readonly string[] {
    this.requireElement(id);
    return this.elements.removeElementAndPromoteChildren(id);
  }
  /**
   * Reads every element in this element subtree once as a flat record, including descendants.
   *
   * For a container, the array follows hierarchy traversal; null uses document storage
   * order. Neither order follows stacking values. Records contain
   * childIds. Outside transactions, collection identity is stable until this subtree changes;
   * treat snapshots as read-only because cached objects are shared between readers.
   *
   * @returns Detached nodes, or an empty array for a missing or empty subtree.
   */
  getElementNodes() { return this.document.elements.getElementNodes(this.rootElementId); }
  /**
   * Reads this element subtree's recursive root trees, with descendants nested under parents.
   *
   * Roots follow the selected child list or the document root list. Outside transactions, cached arrays and
   * unchanged subtree objects are reused. Treat all returned snapshots as read-only.
   *
   * @returns Recursive roots, or an empty array for a missing or empty subtree.
   */
  getElements() { return this.document.elements.getElements(this.rootElementId); }
  /**
   * Reads a complete subtree only if its root belongs to this element subtree.
   *
   * Children retain their sibling order. Cached unchanged branches are reused outside
   * transactions. The snapshot is detached from storage but must be treated as
   * read-only; use manager commands to change the document.
   *
   * @param id - Stable ID of a root or nested element to read.
   * @returns Recursive element with children, or undefined when missing or outside this element subtree.
   */
  getElement(id: string) {
    if (!this.hasElement(id)) return undefined;
    return this.elements.getElement(id);
  }
  /**
   * Observes a local subtree, including descendant edits and changes of parent placement.
   *
   * A missing or outside ID may be observed. The callback runs when its local tree
   * snapshot changes, including entry into or departure from this element subtree. No initial
   * callback is made. The shared editor manager also releases this subscription on destroy.
   *
   * @param id - Stable subtree-root ID to observe.
   * @param listener - Callback that can reread the tree after cache invalidation.
   * @returns Function that removes this listener.
   */
  subscribeElement(id: string, listener: () => void) {
    if (this.rootElementId === null) return this.elements.subscribeElement(id, listener);
    return this.observeElement(id, listener, (notify) => this.elements.subscribeElement(id, notify));
  }
  /**
   * Reads one local flat record without assembling descendants.
   *
   * The result includes ordered childIds. Cached records are reused
   * outside transactions until invalidated; treat them as read-only.
   *
   * @param id - Stable element ID to read.
   * @returns Detached node, or undefined when missing or outside this element subtree.
   */
  getElementNode(id: string) {
    const element = this.elements.getElementNode(id);
    if (!element || id === this.rootElementId) return undefined;
    if (this.rootElementId === null) return element;
    let parent = this.elements.getParentId(id);
    while (parent) {
      if (parent === this.rootElementId) return element;
      parent = this.elements.getParentId(parent);
    }
    return undefined;
  }
  /**
   * Checks element existence and ownership in this element subtree.
   *
   * @param id - Stable element ID to inspect.
   * @returns True only when the element exists and belongs to this element subtree.
   */
  hasElement(id: string) { return this.getElementNode(id) !== undefined; }
  /**
   * Observes changes to records, roots, or descendant placement in this element subtree.
   *
   * Entry and departure of elements also notify the listener. Registration makes no
   * initial callback. Call its disposer when this consumer is released. The shared editor manager
   * also releases outstanding subscriptions when it is destroyed.
   *
   * @param listener - Callback invoked after affected subtree snapshots are invalidated.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void) { return this.rootElementId === null ? this.elements.subscribe(listener) : this.elements.subscribeElement(this.rootElementId, listener); }
  /**
   * Observes a local flat record, including its child IDs and parent placement.
   *
   * A missing or outside ID may be observed. The callback runs when the local snapshot
   * changes, including entry into the subtree, departure, or deletion. A descendant's payload edit alone
   * does not notify its parent node. There is no initial call; the shared editor manager
   * also releases this subscription on destroy.
   *
   * @param id - Stable element ID to observe.
   * @param listener - Callback that can reread the local node after invalidation.
   * @returns Function that removes this listener.
   */
  subscribeElementNode(id: string, listener: () => void) {
    if (this.rootElementId === null) return this.elements.subscribeElementNode(id, listener);
    return this.observeElement(id, listener, (notify) => this.elements.subscribeElementNode(id, notify));
  }
  /**
   * Observes changes to the ordered list of element IDs in this element subtree.
   *
   * Insertion, deletion, cross-parent moves, and hierarchy changes that reorder the
   * flat traversal can notify the listener. Payload-only edits do not. There is no
   * initial callback; the caller may dispose early; manager destruction also releases the subscription.
   *
   * @param listener - Callback invoked when the local ID list changes.
   * @returns Function that removes this listener.
   */
  subscribeMembership(listener: () => void) {
    let ids = this.getElementNodes().map((element) => element.id);
    return this.subscribe(() => {
      const next = this.getElementNodes().map((element) => element.id);
      if (next.length !== ids.length || next.some((id, index) => id !== ids[index])) { ids = next; listener(); }
    });
  }
  /**
   * Inserts a new recursive subtree into this element subtree through the editor pipeline.
   *
   * The root is inserted in the selected local parent, or appended to panel roots by default.
   * children creates new subtrees, while childIds reparents existing nonoverlapping
   * local subtrees. Supplied IDs are preserved and must be unique across the whole
   * document; missing IDs are allocated. An explicit beforeId selects its sibling position.
   *
   * Elements with children may omit frame to use their direct children's bounds at insertion;
   * elements without children need a frame. All new nodes pass through
   * editor processors and application preparation before transactional document writes.
   * The operation shares one history batch. External preparation side effects are not
   * rolled back when later validation fails.
   *
   * @param input - Element type, stacking order, optional identity/props/children, and
   * canvas-relative frame when required. Nonempty childIds cannot accompany children.
   * @param destination - Panel root or included parent, and optional next sibling; omitted appends to panel roots.
   * @returns Detached inserted tree with recursive children and final identities.
   * @throws If the root is absent, IDs collide, children are invalid or outside,
   * input is cyclic or malformed, or processing or application preparation fails.
   */
  insertElement(input: EditorElementInput, destination: PanelDestination = { root: true }) {
    this.requireRoot();
    const visiting = new Set<EditorElementInput>();
    const checkChildren = (value: EditorElementInput) => {
      if (visiting.has(value)) throw new Error("Cyclic element input");
      visiting.add(value);
      value.childIds?.forEach((id) => this.requireElement(id));
      value.children?.forEach(checkChildren);
      visiting.delete(value);
    };
    checkChildren(input);
    if ("root" in destination ? destination.root !== true : typeof destination.parentId !== "string") throw new Error("Panel destination requires root: true or a parent ID");
    const parentId = "root" in destination ? this.rootElementId : destination.parentId;
    if (parentId !== this.rootElementId && parentId !== null) this.requireElement(parentId);
    return this.elements.insertElement(input, { parentId, beforeId: destination.beforeId });
  }
  /**
   * Patches one local element through the shared editor pipeline and history batch.
   *
   * Frame fields and props are shallow-merged; undefined prop values delete keys.
   * Only requested fields are written. Identity, type, parentage, and children stay unchanged.
   *
   * @param id - Existing element in this element subtree.
   * @param patch - Geometry, stacking order, or property fields to change.
   * @returns Detached flat updated node with childIds, not recursive children.
   * @throws Before writing if the root or element is absent, the target is
   * outside this subtree, or processing or resulting-record validation fails.
   */
  updateElement(id: string, patch: EditorElementPatch) { return this.updateElements([{ id, patch }])[0]!; }
  /**
   * Checks all targets belong to this element subtree, then processes and writes patches atomically.
   *
   * Frame fields and props are shallow-merged; undefined prop values delete keys.
   * Only requested fields are written; structure cannot change. Duplicate IDs observe
   * earlier patches in the same batch. The operation shares one history batch.
   *
   * @param updates - Ordered local element IDs and patches; an empty list is allowed.
   * @returns Flat updated nodes in input order, including intermediate results for
   * repeated IDs. An empty input returns an empty array.
   * @throws Before writing if any target is absent or outside this element subtree, or
   * processing or resulting-record validation fails.
   */
  updateElements(updates: readonly EditorElementUpdate[]) {
    updates.forEach(({ id }) => this.requireElement(id));
    return this.elements.updateElements(updates);
  }
  /**
   * Deletes a local element and all its descendants in one history operation.
   *
   * The deleted reference is removed from its parent or document roots. Source blocks
   * and opaque references in other records' props remain unchanged.
   *
   * @param id - Subtree root to remove; a missing element is ignored.
   * @throws If the root is missing or an existing target is outside this subtree.
   */
  removeElement(id: string) { this.removeElements([id]); }
  /**
   * Deletes local subtrees together after checking the entire selection's ownership.
   *
   * Missing IDs are ignored and overlapping selections are visited once. Parent and
   * root references are removed; source blocks and opaque references are unchanged.
   * The shared editor manager performs writes in one transaction and history batch.
   *
   * @param ids - Local subtree roots to delete; an empty list is allowed.
   * @throws Before writing if the root is absent, even for an empty selection,
   * or any existing selected element is outside this subtree.
   */
  removeElements(ids: readonly string[]) {
    this.requireRoot();
    ids.forEach((id) => { if (this.elements.hasElement(id)) this.requireElement(id); });
    this.elements.removeElements(ids);
  }
  /**
   * Combines record notifications with entry/exit checks after structural changes.
   * Observing the whole subtree for every record would wake all rows after a single
   * geometry edit. Placement checks run only for structure changes, including moves
   * of an ancestor whose descendants' own records remain untouched.
   */
  private observeElement(id: string, listener: () => void, subscribeRecord: (notify: () => void) => () => void): () => void {
    let present = this.hasElement(id);
    const unsubscribeRecord = subscribeRecord(() => {
      const next = this.hasElement(id);
      const notify = present || next;
      present = next;
      if (notify) listener();
    });
    const unsubscribeStructure = this.elements.subscribeStructure(() => {
      const next = this.hasElement(id);
      if (next === present) return;
      present = next;
      listener();
    });
    return () => { unsubscribeRecord(); unsubscribeStructure(); };
  }

  /** @param parentId - Local parent. @returns Its children without descendants, empty outside the panel. */
  getChildIds(parentId: string): readonly string[] { return this.getElementNode(parentId)?.childIds ?? []; }

  private requireRoot(): void {
    if (this.rootElementId !== null && !this.elements.hasElement(this.rootElementId)) throw new Error(`Root element ${this.rootElementId} not found`);
  }
  private requireElement(id: string): void {
    this.requireRoot();
    if (!this.hasElement(id)) throw new Error(`Element ${id} is outside root ${this.rootElementId}`);
  }
}
