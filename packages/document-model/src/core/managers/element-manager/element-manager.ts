import { Listeners } from "@chulane/rivto-utils";
/**
 * Stores first-class canvas elements in adapter-neutral collaborative maps.
 * The manager validates portable records, observes changes, delegates snapshot
 * caching, and exposes the element scopes tracked by history.
 */
import { type ElementDestination, type ElementSnapshot } from "../../types";
import type {
  CRDTArray,
  CRDTDoc,
  CRDTType,
  CRDTMap,
  CRDTUndoScope,
  CRDTObserveEvent,
} from "@chulane/crdt-doc";
import type {
  ElementNode,
  DocumentElement,
  DocumentElementManagerApi,
  ElementFrame,
  ElementInput,
  ElementPatch,
  ElementUpdate,
} from "../../types";
import type { ElementFrameStorage, ElementStorage, IDElement, IDProp } from "../../types/storage";
import { assignMap, clone, isCRDTMap, requireNonemptyId } from "../../utils";
import {
  normalizeElementFrame,
  normalizeElementProps,
  normalizeElementZIndex,
  validateElementCollection,
} from "./utils";
import { ElementHierarchy } from "./hierarchy";
import { ElementCache } from "./cache";

type PreparedElementInput = ElementInput & { id: string; frame: ElementFrame };

const ELEMENTS_KEY = "rivto.editor.elements";
/**
 * Owns generic first-class canvas records without interpreting element types.
 *
 * Geometry, layer, and props envelopes are normalized as document invariants.
 * Editor-specific processors run before values cross this storage boundary.
 */
export class DocumentElementManager implements DocumentElementManagerApi {
  /** Creates element identities without exposing generator configuration. */
  protected generateId(): string {
    return crypto.randomUUID();
  }
  private readonly storage: CRDTMap<Record<IDElement, CRDTMap<ElementStorage>>>;
  /** Adapter roots tracked by document-owned history. */
  readonly historyScopes: readonly CRDTUndoScope[];
  /** Detached element and collection snapshot identities. */
  private readonly cache = new ElementCache();
  private readonly hierarchy: ElementHierarchy;
  private readonly rootIds: CRDTArray<string>;
  private readonly structureListeners = new Listeners<{ changed: void }>();
  private readonly pendingNodes = new Set<string>();
  private readonly pendingTrees = new Set<string>();
  private pendingStructure = false;
  private pendingMembership = false;
  private pendingCollection = false;
  /** Subscribers to any element record or collection change. */
  private readonly listeners = new Listeners<{ changed: void }>();
  /** Subscribers to element insertion or deletion. */
  private readonly membershipListeners = new Listeners<{ changed: void }>();
  /** Subscribers to individual element records, keyed by element ID for subtree changes. */
  private readonly treeListeners = new Listeners<Record<string, void>>();
  /** Subscribers keyed by element ID for changes to the individual element. */
  private readonly elementListeners = new Listeners<Record<string, void>>();

  /**
   * Creates an element manager over existing collaborative document storage.
   *
   * @param crdt - Collaborative storage adapter.
   */
  constructor(private readonly crdt: CRDTDoc) {
    this.storage = crdt.getMap<Record<IDElement, CRDTMap<ElementStorage>>>(ELEMENTS_KEY);
    this.rootIds = crdt.getArray<string>("rivto.editor.rootElementIds");
    this.hierarchy = new ElementHierarchy(crdt, this.storage, this.rootIds);
    // Valid preloaded trees need parent links even when normalization makes no writes.
    this.cache.invalidateTrees(new Set(), this.hierarchy.getLocations());
    this.historyScopes = [this.storage, this.rootIds];
    this.rootIds.observe(() => this.publishChanges(new Set(), true));
    this.storage.observe((events, transaction) => this.onRecordsChanged(events, transaction));
    // Root and record observers can run in either order. The update event fires
    // after both, while still inside the synchronous commit, so no subscriber
    // reads a tree whose payload caches have not yet been invalidated.
    crdt.on("update", () => this.notifyChanges());
  }

  /**
   * Reports whether canonical storage contains one element record.
   *
   * @param id - Stable element identifier to inspect.
   * @returns True when the element record exists.
   */
  hasElement(id: string): boolean {
    return this.storage.has(id);
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
  getElementNode(id: string): ElementNode | undefined {
    return this.cache.readNode(id, this.crdt.isTransacting, () => {
      const value = this.storage.get(id);
      return isCRDTMap(value) ? this.read(value) : undefined;
    });
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
  getElement(id: string): DocumentElement | undefined {
    return this.cache.readTree(id, this.crdt.isTransacting, () => {
      const node = this.getElementNode(id);
      if (!node) {
        return undefined;
      }
      const { childIds, ...fields } = node;
      const children = childIds.flatMap((childId) => {
        const child = this.getElement(childId);
        return child ? [child] : [];
      });
      return { ...fields, children };
    });
  }

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
  getElements(rootElementId: string | null = null): DocumentElement[] {
    return this.cache.readForest(rootElementId, this.crdt.isTransacting, () =>
      this.getRootIds(rootElementId).flatMap((id) => {
        const tree = this.getElement(id);
        return tree ? [tree] : [];
      }),
    );
  }

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
  subscribeElement(id: string, listener: () => void): () => void {
    return this.treeListeners.subscribe(id, listener);
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
  getElementNodes(rootElementId: string | null = null): ElementNode[] {
    if (rootElementId !== null) {
      return this.cache.readSubtreeNodes(rootElementId, this.crdt.isTransacting, () =>
        this.hierarchy
          .collect(this.getRootIds(rootElementId))
          .flatMap((id) => this.getElementNode(id) ?? []),
      );
    }
    return this.cache.readCollection(this.crdt.isTransacting, () =>
      [...this.storage.keys()].flatMap((id) => {
        const element = this.getElementNode(id);
        return element ? [element] : [];
      }),
    );
  }

  /**
   * Reads the ordered direct child IDs of an element or document root IDs, excluding descendants.
   *
   * @param rootElementId - Container ID, or null/omitted for document roots. The container itself is excluded.
   * @returns Read-only root list, with stable identity while its contents are unchanged;
   * an empty list when the selected container is missing or has no children.
   */
  getRootIds(rootElementId: string | null = null): readonly string[] {
    return rootElementId === null
      ? this.hierarchy.getRootIds()
      : this.hierarchy.getChildIds(rootElementId);
  }

  /**
   * Resolves an element's direct parent from document roots and child lists.
   *
   * @param id - Stable element ID to locate.
   * @returns Parent element ID, null for a document root, or undefined when absent.
   */
  getParentId(id: string): string | null | undefined {
    return this.hierarchy.getLocation(id)?.parentId;
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
    this.hierarchy.move(ids, destination);
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
    const location = this.hierarchy.getLocation(id);
    if (!location) {
      throw new Error(`Element ${id} not found`);
    }
    const children = [...this.hierarchy.getChildIds(id)];
    this.crdt.transact(() => {
      this.moveElements(children, { ...location, beforeId: id });
      this.removeElement(id);
    });
    return children;
  }

  /**
   * Repairs missing, duplicate, cyclic, and orphaned hierarchy references after CRDT merges.
   *
   * The first placement encountered while traversing document roots in order wins. Missing
   * and repeated references are removed; unreachable records are retained at the
   * document root. Payloads are not deleted. Repairs update root and child lists in one
   * transaction using the same hierarchy traversal as reads.
   */
  normalize(): void {
    this.hierarchy.invalidate();
    this.hierarchy.normalize();
  }

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
  validateHierarchy(elements: readonly ElementSnapshot[], rootElementIds: readonly string[]): void {
    ElementHierarchy.validate(elements, rootElementIds);
  }

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
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("changed", listener);
  }

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
  subscribeElementNode(id: string, listener: () => void): () => void {
    return this.elementListeners.subscribe(id, listener);
  }

  /**
   * Observes changes to document roots, child lists, and element membership.
   * Payload-only edits do not notify this subscription. The callback runs after
   * hierarchy invalidation, at most once per observed transaction, with no initial call.
   * @param listener - Callback that can resolve current element placement.
   * @returns Function that removes this exact listener.
   */
  subscribeStructure(listener: () => void): () => void {
    return this.structureListeners.subscribe("changed", listener);
  }

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
  subscribeMembership(listener: () => void): () => void {
    return this.membershipListeners.subscribe("changed", listener);
  }

  /**
   * Creates the element ID map used by an immediate import.
   *
   * Available source IDs survive cut/paste. IDs already present in this
   * document receive generated replacements so copied elements cannot overwrite
   * existing data. The returned IDs are not inserted or reserved.
   *
   * @param sourceIds - Stable source IDs in import order.
   * @returns Destination ID for every source element ID.
   */
  createImportIdMap(sourceIds: readonly string[]): ReadonlyMap<string, string> {
    const assigned = new Set<string>();
    return new Map(
      sourceIds.map((sourceId) => {
        // A free identity survives cut/paste. Copying into a document that still
        // owns it needs a fresh identity to avoid replacing data.
        const reusable = !this.storage.has(sourceId) && !assigned.has(sourceId);
        let id = reusable ? sourceId : this.generateId();
        // Generated collisions are improbable, but the document boundary still
        // guarantees a usable mapping rather than relying on chance.
        while (this.storage.has(id) || assigned.has(id)) {
          id = this.generateId();
        }
        assigned.add(id);
        return [sourceId, id];
      }),
    );
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
   * @param input - Type, finite stacking order, optional ID/props/children,
   * and frame in canvas coordinates when required.
   * @param destination - Optional parent and next-sibling anchor; defaults to appending to document roots.
   * @returns Detached normalized recursive subtree, with supplied IDs preserved and
   * missing IDs allocated. Use getElementNode for a flat record with childIds.
   * @throws If the destination is missing or invalid, an ID collides, input is cyclic or malformed,
   * geometry is invalid, existing children are missing, overlap, or would contain the destination
   * parent, or application identity preparation fails.
   */
  insertElement(
    input: ElementInput,
    destination: ElementDestination = { parentId: null },
  ): DocumentElement {
    if (destination.parentId !== null && !this.hasElement(destination.parentId)) {
      throw new Error("Element destination not found");
    }
    if (
      destination.beforeId !== undefined &&
      !this.getRootIds(destination.parentId).includes(destination.beforeId)
    ) {
      throw new Error("Invalid destination sibling");
    }
    const records: PreparedElementInput[] = [];
    const ids = new Set<string>();
    const visiting = new Set<ElementInput>();
    const existing = new Map<string, DocumentElement>();
    const prepare = (source: ElementInput): PreparedElementInput => {
      if (visiting.has(source)) {
        throw new Error("Cyclic element input");
      }
      visiting.add(source);
      if (source.childIds !== undefined && !Array.isArray(source.childIds)) {
        throw new Error("Element child IDs must be an array");
      }
      if (source.children !== undefined && !Array.isArray(source.children)) {
        throw new Error("Element children must be an array");
      }
      if (source.children !== undefined && source.childIds?.length) {
        throw new Error("Use children or childIds, not both");
      }
      const children = source.children?.map(prepare);
      const childIds = children?.map((child) => child.id!) ?? [...(source.childIds ?? [])];
      if (!children) {
        for (const childId of childIds) {
          const child = this.getElement(childId);
          if (!child || existing.has(childId)) {
            throw new Error("Children must be distinct existing elements");
          }
          existing.set(childId, child);
        }
      }
      const id = requireNonemptyId(source.id ?? this.generateId(), "Element");
      let frame = source.frame;
      if (!frame) {
        const frames =
          children?.map((child) => child.frame) ?? childIds.map((id) => existing.get(id)!.frame);
        frame = this.childrenFrame(frames);
      }
      const validated = this.processElement({
        ...source,
        id,
        frame: frame!,
        children: undefined,
        childIds,
      });
      const prepared = this.processElement(this.prepareElement(validated));
      if (this.storage.has(prepared.id!) || ids.has(prepared.id!)) {
        throw new Error(`Element ${prepared.id} already exists`);
      }
      ids.add(prepared.id!);
      records.push(prepared);
      visiting.delete(source);
      return prepared;
    };
    const root = prepare(input);
    for (const id of existing.keys()) {
      let parent = this.getParentId(id);
      while (parent) {
        if (existing.has(parent)) {
          throw new Error("Child subtrees must not overlap");
        }
        parent = this.getParentId(parent);
      }
    }
    const retained = this.hierarchy
      .collect([...existing.keys()])
      .map((id) => this.getElementNode(id)!);
    if (
      destination.parentId !== null &&
      retained.some((node) => node.id === destination.parentId)
    ) {
      throw new Error("Cannot insert an element into its own subtree");
    }
    if (destination.beforeId && retained.some((node) => node.id === destination.beforeId)) {
      throw new Error("Invalid destination sibling");
    }
    validateElementCollection([...records, ...retained]);
    ElementHierarchy.validate(
      [...records, ...retained].map((record) => ({
        id: record.id,
        childIds: [...(record.childIds ?? [])],
      })),
      [root.id],
    );
    this.crdt.transact(() => {
      if (records.length === 1 && !existing.size) {
        // Keep ordinary insertion incremental, including large projection batches.
        this.insertInto(root, false, destination.parentId);
        if (destination.beforeId) {
          this.moveElements([root.id], destination);
        }
        return;
      }
      if (existing.size) {
        this.hierarchy.detach([...existing.keys()]);
      }
      records.forEach((record) => this.insertInto(record, true));
      this.hierarchy.append(root.id!, destination.parentId);
      if (destination.beforeId) {
        this.moveElements([root.id], destination);
      }
      this.hierarchy.invalidate();
    });
    // Assemble from prepared values so insertion does not reread every stored field.
    const trees = new Map(existing);
    for (const record of records) {
      const { childIds, ...node } = this.result(record.id!, record);
      trees.set(record.id!, { ...node, children: childIds.map((id) => trees.get(id)!) });
    }
    return trees.get(root.id!)!;
  }

  /**
   * Prepares insertion after validation and before the first shared write.
   * Supplied identities can be reused; missing IDs have already been allocated.
   * Both fresh and known records pass through this preparation step, including
   * deterministic derived records restored after deletion or document transfers.
   * Default storage needs no external identity check and leaves the input unchanged.
   *
   * @param input - Validated element with its supplied or generated ID.
   * @returns Prepared insertion data with an allocated or reused ID, or the unchanged default input.
   * @throws If application creation constraints fail or an identity cannot be reused.
   */
  protected prepareElement(input: ElementInput): ElementInput {
    return input;
  }

  /**
   * Processes nested record changes, including remote and undo writes.
   * Invalidates cached elements before notifying record, collection, and membership subscribers.
   * Subclasses call super first, then use the returned IDs for their added work;
   * record readers see current transaction state without a collection scan.
   * @param events - Changes relative to the element storage map, including deleted keys.
   * @param transaction - Commit identity available to subclasses; the default manager publishes at the update event.
   * @returns Changed or deleted element IDs; the default manager performs no external persistence.
   */
  protected onRecordsChanged(
    events: readonly CRDTObserveEvent[],
    transaction: unknown,
  ): ReadonlySet<string> {
    const changedIds = new Set<string>();
    let membershipChanged = false;
    events.forEach(({ path, keys }) => {
      const id = path[0];
      if (typeof id === "string") {
        changedIds.add(id);
      }
      if (path.length === 0 && keys.length) {
        membershipChanged = true;
        keys.forEach((key) => changedIds.add(key));
      }
    });
    const structural = events.some(
      ({ path, keys }) =>
        path.length === 0 ||
        path[1] === "childIds" ||
        (path.length === 1 && keys.includes("childIds")),
    );
    this.publishChanges(changedIds, structural);
    this.pendingMembership ||= membershipChanged;
    return changedIds;
  }

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
  updateElement(id: string, patch: ElementPatch): ElementNode {
    return this.updateElements([{ id, patch }])[0]!;
  }

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
  updateElements(updates: readonly ElementUpdate[]): ElementNode[] {
    const simulated = new Map<string, PreparedElementInput>();
    const prepared = updates.map(({ id, patch }) => {
      const element = this.required(id);
      const current = simulated.get(id) ?? this.toInput(this.read(element));
      const validated = this.processElement({
        ...current,
        frame: patch.frame ? { ...current.frame, ...patch.frame } : current.frame,
        zIndex: patch.zIndex ?? current.zIndex,
        props: patch.props ? { ...current.props, ...patch.props } : current.props,
      });
      simulated.set(id, validated);
      return { element, patch, validated };
    });
    this.crdt.transact(() =>
      prepared.forEach(({ element, patch, validated }) => {
        if (patch.frame) {
          assignMap(
            this.requiredMap<ElementFrameStorage>(element, "frame"),
            validated.frame as ElementFrameStorage,
            false,
          );
        }
        if (patch.zIndex !== undefined) {
          element.set("zIndex", validated.zIndex);
        }
        if (patch.props) {
          const props = this.requiredMap<Record<string, CRDTType>>(element, "props");
          for (const key of Object.keys(patch.props)) {
            const value = validated.props?.[key];
            if (value === undefined) {
              props.delete(key);
            } else {
              props.set(key, clone(value) as CRDTType);
            }
          }
        }
      }),
    );
    return prepared.map(({ validated }, index) => this.result(updates[index]!.id, validated));
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
    this.removeElements([id]);
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
    const removed = this.hierarchy.collect(ids);
    this.crdt.transact(() => {
      this.hierarchy.detach(removed);
      removed.forEach((id) => this.storage.delete(id));
      this.hierarchy.invalidate();
    });
  }

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
  validateElements(elements: readonly ElementSnapshot[]): void {
    validateElementCollection(elements);
  }

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
  loadElements(elements: readonly ElementSnapshot[]): void {
    this.validateElements(elements);
    const prepared = elements.map((element) => ({
      ...element,
      frame: normalizeElementFrame(element.frame),
      props: normalizeElementProps(element.props),
    }));
    this.storage.clear();
    prepared.forEach((element) => this.insertInto(element, true));
    this.hierarchy.invalidate();
  }

  /**
   * Replaces the document's ordered element roots during snapshot restoration.
   * The caller validates the full tree and owns the surrounding transaction.
   * @param ids - Complete ordered root IDs matching the restored element records.
   */
  loadRootIds(ids: readonly string[]): void {
    this.rootIds.delete(0, this.rootIds.length);
    if (ids.length) {
      this.rootIds.insert(0, ...ids);
    }
    this.hierarchy.invalidate();
  }

  /** Computes initial parent geometry from child frames without changing their coordinates. */
  private childrenFrame(frames: readonly ElementFrame[]): ElementFrame {
    if (!frames.length) {
      throw new Error("An element without children requires a frame");
    }
    let x = Infinity;
    let y = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const frame of frames) {
      x = Math.min(x, frame.x);
      y = Math.min(y, frame.y);
      right = Math.max(right, frame.x + frame.width);
      bottom = Math.max(bottom, frame.y + frame.height);
    }
    return { x, y, width: right - x, height: bottom - y };
  }

  /**
   * Invalidates reads immediately and collects notifications for the current commit.
   * Structural observers may run in either order. The tree cache retains previous
   * parents so both sides of moves and deletions are invalidated before publication.
   * Subscribers are notified by the adapter's update event after every storage
   * observer has invalidated its own records; this also covers remote and undo writes.
   */
  private publishChanges(changedIds: Set<string>, structural: boolean): void {
    if (structural) {
      this.hierarchy.invalidate();
    }
    this.cache.invalidate(changedIds);
    const changedTrees = this.cache.invalidateTrees(
      changedIds,
      structural ? this.hierarchy.getLocations() : undefined,
    );
    changedIds.forEach((id) => this.pendingNodes.add(id));
    changedTrees.forEach((id) => this.pendingTrees.add(id));
    this.pendingStructure ||= structural;
    this.pendingCollection = true;
  }

  /** Publishes one complete commit, clearing pending state before any listener can write again. */
  private notifyChanges(): void {
    if (!this.pendingCollection) {
      return;
    }
    const nodes = [...this.pendingNodes];
    const trees = [...this.pendingTrees];
    const structure = this.pendingStructure;
    const membership = this.pendingMembership;
    this.pendingNodes.clear();
    this.pendingTrees.clear();
    this.pendingCollection = false;
    this.pendingStructure = false;
    this.pendingMembership = false;
    nodes.forEach((id) => this.elementListeners.emit(id));
    trees.forEach((id) => this.treeListeners.emit(id));
    if (structure) {
      this.structureListeners.emit("changed");
    }
    if (membership) {
      this.membershipListeners.emit("changed");
    }
    this.listeners.emit("changed");
  }

  /** Writes prepared or restored element data without running application preparation again. */
  private insertInto(
    validated: ElementInput,
    restoring = false,
    parentId: string | null = null,
  ): void {
    const id = requireNonemptyId(validated.id ?? this.generateId(), "Element");
    if (this.storage.has(id)) {
      throw new Error(`Element ${id} already exists`);
    }
    this.crdt.transact(() => {
      const model = this.crdt.createDetachedMap<ElementStorage>();
      const frameMap = this.crdt.createDetachedMap<ElementFrameStorage>();
      const props = this.crdt.createDetachedMap<Record<string, CRDTType>>();
      model.set("id", id);
      model.set("type", validated.type);
      const children = this.crdt.createDetachedArray<string>();
      model.set("childIds", children);
      model.set("frame", frameMap);
      model.set("zIndex", validated.zIndex);
      model.set("props", props);
      this.storage.set(id, model);
      assignMap(frameMap, validated.frame as ElementFrameStorage);
      assignMap(props, validated.props ?? {});
      if (restoring) {
        if (validated.childIds?.length) {
          children.insert(0, ...validated.childIds);
        }
        this.hierarchy.invalidate();
      } else {
        this.hierarchy.append(id, parentId);
        if (validated.childIds?.length) {
          this.moveElements(validated.childIds, { parentId: id });
        }
      }
    });
  }

  /**
   * Normalizes one portable element record.
   *
   * @param element - Candidate insert input or reconstructed update.
   * @returns Detached element containing normalized generic fields.
   * @throws {Error} When the type is empty or the record is invalid.
   */
  private processElement(element: ElementInput): PreparedElementInput {
    if (!element.type) {
      throw new Error("Element type is required");
    }
    return {
      ...element,
      id: requireNonemptyId(element.id, "Element"),
      frame: normalizeElementFrame(element.frame),
      zIndex: normalizeElementZIndex(element.zIndex),
      props: normalizeElementProps(element.props),
    };
  }

  /**
   * Detaches one already-normalized mutation value without rereading storage.
   *
   * @param id - Stable stored identity.
   * @param element - Complete normalized mutation value.
   * @returns Complete detached element matching the persisted record.
   */
  private result(id: string, element: ElementInput & { frame: ElementFrame }): ElementNode {
    return {
      id,
      childIds: [...this.hierarchy.getChildIds(id)],
      type: element.type,
      frame: { ...element.frame },
      zIndex: element.zIndex,
      props: clone(element.props ?? {}) as Record<string, unknown>,
    };
  }

  /**
   * Converts a detached element into mutation input without dropping identity.
   *
   * @param element - Materialized element record.
   * @returns Portable input used for update reconstruction.
   */
  private toInput(element: ElementNode): ElementNode {
    return element;
  }

  /**
   * Materializes one shared record as detached portable element data.
   *
   * @param value - Stored element map.
   * @returns Detached element with normalized geometry.
   */
  private read(value: CRDTMap<ElementStorage>): ElementNode {
    return {
      id: String(value.get("id")),
      childIds: [...this.hierarchy.getChildIds(String(value.get("id")))],
      type: String(value.get("type")),
      frame: normalizeElementFrame(
        this.requiredMap<ElementFrameStorage>(value, "frame").toObject() as unknown as ElementFrame,
      ),
      zIndex: normalizeElementZIndex(value.get("zIndex")),
      props: clone(
        this.requiredMap<Record<IDProp, CRDTType>>(value, "props").toObject() as Record<
          string,
          unknown
        >,
      ),
    };
  }

  /**
   * Resolves one required shared element record.
   *
   * @param id - Element identifier to resolve.
   * @returns Stored element map.
   * @throws {Error} When the element is absent.
   */
  private required(id: string): CRDTMap<ElementStorage> {
    const value = this.storage.get(id);
    if (!isCRDTMap(value)) {
      throw new Error(`Element ${id} not found`);
    }
    return value;
  }

  /**
   * Resolves one required collaborative child map.
   *
   * @param value - Parent element map.
   * @param key - Nested map field name.
   * @returns Nested shared map.
   * @throws {Error} When the field is missing or has the wrong shared type.
   */
  private requiredMap<Value extends Record<string, unknown>>(
    value: CRDTMap<ElementStorage>,
    key: "frame" | "props",
  ): CRDTMap<Value> {
    const child = value.get(key);
    if (!isCRDTMap(child)) {
      throw new Error(`Element ${String(value.get("id"))} has invalid ${key}`);
    }
    return child as CRDTMap<Value>;
  }
}
