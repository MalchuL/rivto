import type {
  EditorElementNode,
  EditorElementFrame,
  EditorElement,
  EditorElementInput,
  EditorElementPatch,
  EditorElementUpdate,
} from "../../editor/model";
import type { DocumentModel, ElementDestination, ElementInput, ElementUpdate } from "@chulane/document-model";
import type { RivtoEditorApi } from "../../editor/types";
import type { ElementProcessor } from "./element-pipe";
import type { ElementManagerApi } from "../types";
import { ElementTree } from "./element-tree";
import { Pipe } from "../../utils/pipe";

interface ElementProcessorRegistration {
  readonly processor: ElementProcessor;
  dispose: () => void;
}

/** Public typed manager for generic first-class canvas elements. */
export class ElementManager implements ElementManagerApi {
  /**
   * Editor-owned element processing pipeline.
   *
   * It remains stable across operations on different documents, so extension
   * processors follow this editor without becoming shared document state.
   */
  private readonly pipe = new Pipe<ElementInput>();
  private readonly processors = new Set<ElementProcessorRegistration>();
  private readonly trees = new Map<string | null, ElementTree>();
  private readonly subscriptions = new Set<() => void>();

  constructor(
    private readonly editor: RivtoEditorApi,
  ) {
  }

  /**
   * Reads the ordered direct child IDs of an element or document root IDs, excluding descendants.
   *
   * @param rootElementId - Container ID, or null/omitted for document roots. The container itself is excluded.
   * @returns Read-only root list, with stable identity while its contents are unchanged;
   * an empty list when the selected container is missing or has no children.
   */
  getRootIds(rootElementId: string | null = null): readonly string[] { return this.document.elements.getRootIds(rootElementId); }

  /**
   * Resolves an element's direct parent from document roots and child lists.
   *
   * @param id - Stable element ID to locate.
   * @returns Parent element ID, null for a document root, or undefined when absent.
   */
  getParentId(id: string): string | null | undefined { return this.document.elements.getParentId(id); }


  /**
   * Binds element reads and commands to a container's descendants or document roots.
   * Handles reuse this editor's processors, history, and model; no records are created.
   * A missing container reads as empty and rejects insertion until restored, including
   * by undo. The container itself is excluded and cannot be mutated through the handle.
   * @param rootElementId - Container ID, or null for the complete document tree.
   * @returns Stable handle for this root for the lifetime of the manager.
   */
  forRoot(rootElementId: string | null): ElementTree {
    let tree = this.trees.get(rootElementId);
    if (!tree) {
      tree = new ElementTree(this, this.document, rootElementId);
      this.trees.set(rootElementId, tree);
    }
    return tree;
  }

  /**
   * Moves selected subtrees together, preserving IDs and canvas-relative geometry.
   * Selecting an ancestor and its descendant moves the ancestor only. The model
   * validates all references before writing; the complete move is transactional.
   * @param ids - Existing elements in destination order; duplicate IDs are ignored.
   * @param destination - Parent (null for document roots) and optional next sibling; omission appends.
   * @throws If an element or destination is missing, the anchor is not a destination
   * sibling, or the move would create a cycle.
   */
  moveElements(ids: readonly string[], destination: ElementDestination): void {
    this.editor.history.batchUpdates(() => this.document.elements.moveElements(ids, destination));
  }

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
  removeElementAndPromoteChildren(id: string): readonly string[] {
    return this.editor.history.batchUpdates(() => this.document.elements.removeElementAndPromoteChildren(id));
  }

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
  registerProcessor(processor: ElementProcessor): () => void {
    const registration: ElementProcessorRegistration = {
      processor,
      dispose: this.pipe.register(processor),
    };
    this.processors.add(registration);
    return () => {
      if (!this.processors.delete(registration)) return;
      registration.dispose();
    };
  }

  /**
   * Reports whether the document contains one element record.
   *
   * @param id - Stable element ID to inspect.
   * @returns True when the element exists.
   */
  hasElement(id: string): boolean {
    return this.document.elements.hasElement(id);
  }

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
  getElement(id: string): EditorElement | undefined { return this.document.elements.getElement(id); }

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
  getElements(rootElementId: string | null = null): EditorElement[] { return this.document.elements.getElements(rootElementId); }

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
  subscribeElement(id: string, listener: () => void): () => void {
    return this.retainSubscription(this.document.elements.subscribeElement(id, listener));
  }

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
  getElementNode(id: string): EditorElementNode | undefined {
    return this.document.elements.getElementNode(id);
  }

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
  getElementNodes(rootElementId: string | null = null): EditorElementNode[] {
    return this.document.elements.getElementNodes(rootElementId);
  }

  /**
   * Observes element records and structural changes across the document.
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
  subscribe(listener: () => void): () => void {
    return this.retainSubscription(this.document.elements.subscribe(listener));
  }

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
  subscribeElementNode(id: string, listener: () => void): () => void {
    return this.retainSubscription(this.document.elements.subscribeElementNode(id, listener));
  }

  /**
   * Observes changes to document roots, child lists, and element membership.
   * Payload-only edits do not notify this subscription. The callback runs after
   * hierarchy invalidation, at most once per observed transaction, with no initial call.
   * @param listener - Callback that can resolve current element placement.
   * @returns Function that removes this exact listener.
   */
  subscribeStructure(listener: () => void): () => void {
    return this.retainSubscription(this.document.elements.subscribeStructure(listener));
  }

  /**
   * Observes changes to the set of stored element records in the document.
   *
   * Insertion and deletion notify this listener; editing props or moving existing
   * records between parents does not change global membership.
   * Registration does not invoke the callback.
   *
   * The subscription remains bound to the document used at registration and is
   * also released when this editor manager is destroyed.
   *
   * @param listener - Callback invoked when record membership changes.
   * @returns Function that removes this exact listener.
   */
  subscribeMembership(listener: () => void): () => void {
    return this.retainSubscription(this.document.elements.subscribeMembership(listener));
  }

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
  insertElement(input: EditorElementInput, destination?: ElementDestination): EditorElement {
    const visiting = new Set<ElementInput>();
    const process = (value: ElementInput): ElementInput => {
      if (visiting.has(value)) throw new Error("Cyclic element input");
      visiting.add(value);
      const processed = this.pipe.process(value);
      if (processed !== value && visiting.has(processed)) throw new Error("Cyclic element input");
      visiting.add(processed);
      const children = processed.children?.map(process);
      visiting.delete(processed);
      visiting.delete(value);
      return { ...processed, children };
    };
    return this.editor.history.batchUpdates(() => this.document.elements.insertElement(process(input), destination));
  }

  /**
   * Creates the element ID map for a destination import.
   *
   * The explicitly scoped document preserves available IDs and replaces collisions. The
   * returned map lets extensions rewrite group and connector references before
   * inserting elements; it does not insert or reserve IDs itself.
   *
   * @param sourceIds - Stable source element IDs in import order.
   * @returns Destination ID for every source element ID.
   */
  createImportIdMap(sourceIds: readonly string[]): ReadonlyMap<string, string> {
    // Keep generation inside the scoped document. Callers use this map to
    // rewrite group and connector references before inserting the elements.
    return this.document.elements.createImportIdMap(sourceIds);
  }

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
  updateElement(id: string, patch: EditorElementPatch): EditorElementNode {
    const [update] = this.processUpdates([{ id, patch }]);
    return this.document.elements.updateElement(update!.id, update!.patch);
  }

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
  updateElements(updates: readonly EditorElementUpdate[]): EditorElementNode[] {
    return this.editor.history.batchUpdates(() => this.document.elements.updateElements(this.processUpdates(updates)));
  }

  /**
   * Deletes one element and its entire element subtree in one transaction.
   *
   * The parent or document root list loses the deleted reference. Source blocks and
   * opaque references stored in other records' props are not changed.
   *
   * @param id - Subtree root to delete; a missing ID does nothing.
   */
  removeElement(id: string): void {
    this.editor.history.batchUpdates(() => this.document.elements.removeElement(id));
  }

  /**
   * Deletes selected element subtrees together in one transaction.
   *
   * Overlapping selections and duplicate IDs are visited only once. References to
   * deleted records are removed from their parent or document root lists. Source blocks
   * and opaque references in other records' props are left unchanged.
   *
   * @param ids - Subtree root IDs to delete; missing IDs and an empty list are harmless.
   */
  removeElements(ids: readonly string[]): void {
    this.editor.history.batchUpdates(() => this.document.elements.removeElements(ids));
  }

  /** Releases this manager's subscriptions and processors. */
  destroy(): void {
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions.clear();
    this.trees.clear();
    this.processors.forEach((registration) => registration.dispose());
    this.processors.clear();
  }

  /**
   * Retains an existing document subscription until explicitly removed or destroyed.
   * Its listener remains bound to the model where the subscription was created.
   * @param unsubscribe - Function that removes the existing document subscription.
   * @returns Function that permanently removes the retained subscription.
   */
  private retainSubscription(unsubscribe: () => void): () => void {
    this.subscriptions.add(unsubscribe);
    return () => {
      if (!this.subscriptions.delete(unsubscribe)) return;
      unsubscribe();
    };
  }

  /** @returns The explicit document or throws outside a document context. */
  private get document(): DocumentModel {
    const document = this.editor.getDocument();
    return document;
  }

  /**
   * Applies editor processors to ordered element patches before document mutation.
   * Duplicate IDs observe earlier processed patches in the batch.
   *
   * @param updates - Ordered portable element patches.
   * @returns Patches containing processor-normalized values.
   */
  private processUpdates(updates: readonly ElementUpdate[]): ElementUpdate[] {
    const simulated = new Map<string, ElementInput & { frame: EditorElementFrame }>();
    return updates.map(({ id, patch }) => {
      const stored = this.getElementNode(id);
      if (!stored) throw new Error(`Element ${id} not found`);
      const current = simulated.get(id) ?? stored;
      const processed = this.pipe.process({
        ...current,
        frame: patch.frame ? { ...current.frame, ...patch.frame } : current.frame,
        zIndex: patch.zIndex ?? current.zIndex,
        props: patch.props ? { ...current.props, ...patch.props } : current.props,
      });
      if (!processed.frame) throw new Error("Updated elements require a frame");
      simulated.set(id, { ...processed, frame: processed.frame });
      const frame = patch.frame
        ? Object.fromEntries(Object.keys(patch.frame).map((key) => [key, processed.frame![key as keyof NonNullable<typeof processed.frame>]]))
        : undefined;
      const props = patch.props
        ? Object.fromEntries(Object.keys(patch.props).map((key) => [key, processed.props?.[key]]))
        : undefined;
      return {
        id,
        patch: {
          ...patch,
          ...(frame ? { frame } : {}),
          ...(patch.zIndex !== undefined ? { zIndex: processed.zIndex } : {}),
          ...(props ? { props } : {}),
        },
      };
    });
  }

}
