/**
 * Stores first-class canvas elements in adapter-neutral collaborative maps.
 * The manager validates portable records, observes changes, delegates snapshot
 * caching, and exposes the element scopes tracked by history.
 */
import type { CRDTDoc, CRDTType, CRDTMap, CRDTUndoScope } from "@chulane/crdt-doc";
import type {
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
import { ElementCache } from "./cache";

const ELEMENTS_KEY = "rivto.editor.elements";
/**
 * Owns generic first-class canvas records without interpreting element types.
 *
 * Geometry, layer, and props envelopes are normalized as document invariants.
 * Editor-specific processors run before values cross this storage boundary.
 */
export class DocumentElementManager implements DocumentElementManagerApi {
  /** Creates element identities without exposing generator configuration. */
  private readonly generateId = (): string => crypto.randomUUID();
  private readonly storage: CRDTMap<Record<IDElement, CRDTMap<ElementStorage>>>;
  /** Adapter roots tracked by document-owned history. */
  readonly historyScopes: readonly CRDTUndoScope[];
  /** Detached element and collection snapshot identities. */
  private readonly cache = new ElementCache();
  /** Subscribers to any element record or collection change. */
  private readonly listeners = new Set<() => void>();
  /** Subscribers to element insertion or deletion. */
  private readonly membershipListeners = new Set<() => void>();
  /** Subscribers to individual element records. */
  private readonly elementListeners = new Map<IDElement, Set<() => void>>();

  /**
   * Creates an element manager over existing collaborative document storage.
   *
   * @param crdt - Collaborative storage adapter.
   */
  constructor(private readonly crdt: CRDTDoc) {
    this.storage = crdt.getMap<Record<IDElement, CRDTMap<ElementStorage>>>(ELEMENTS_KEY);
    this.historyScopes = [this.storage];
    this.storage.observe((events) => {
      const changedIds = new Set<string>();
      let membershipChanged = false;
      events.forEach(({ path, keys }) => {
        const id = path[0];
        if (typeof id === "string") changedIds.add(id);
        if (path.length === 0 && keys.length) {
          membershipChanged = true;
          keys.forEach((key) => changedIds.add(key));
        }
      });
      this.cache.invalidate(changedIds);
      changedIds.forEach((id) => this.emit(this.elementListeners.get(id)));
      this.emit(this.listeners);
      if (membershipChanged) this.emit(this.membershipListeners);
    });
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
   * Reads one placed element.
   *
   * @param id - Stable element ID.
   * @returns Detached element, or undefined when absent.
   */
  getElement(id: string): DocumentElement | undefined {
    return this.cache.readElement(id, this.crdt.isTransacting, () => {
      const value = this.storage.get(id);
      return isCRDTMap(value) ? this.read(value) : undefined;
    });
  }

  /**
   * Materializes every stored element.
   *
   * @returns Every detached element in collaborative map iteration order.
   */
  getElements(): DocumentElement[] {
    return this.cache.readCollection(this.crdt.isTransacting, () => [...this.storage.keys()].flatMap((id) => {
      const element = this.getElement(id);
      return element ? [element] : [];
    }));
  }

  /**
   * Subscribes to any element record or collection change.
   *
   * @param listener - Callback invoked after an element snapshot changes.
   * @returns Function that removes this exact listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribes to changes affecting one element snapshot.
   *
   * @param id - Element identifier to observe.
   * @param listener - Callback invoked after that element changes or disappears.
   * @returns Function that removes this exact listener.
   */
  subscribeElement(id: string, listener: () => void): () => void {
    let listeners = this.elementListeners.get(id);
    if (!listeners) {
      listeners = new Set();
      this.elementListeners.set(id, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners!.delete(listener);
      if (!listeners!.size) this.elementListeners.delete(id);
    };
  }

  /**
   * Subscribes only to element insertion and deletion.
   *
   * @param listener - Callback invoked when collection membership changes.
   * @returns Function that removes this exact listener.
   */
  subscribeMembership(listener: () => void): () => void {
    this.membershipListeners.add(listener);
    return () => this.membershipListeners.delete(listener);
  }

  /**
   * Publishes to a stable listener snapshot so callbacks may unsubscribe safely.
   * @param listeners - Subscribers for one change channel.
   * @returns No value.
   */
  private emit(listeners: ReadonlySet<() => void> | undefined): void {
    if (listeners) [...listeners].forEach((listener) => listener());
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
    return new Map(sourceIds.map((sourceId) => {
      // A free identity survives cut/paste. Copying into a document that still
      // owns it needs a fresh identity to avoid replacing data.
      const reusable = !this.storage.has(sourceId) && !assigned.has(sourceId);
      let id = reusable ? sourceId : this.generateId();
      // Generated collisions are improbable, but the document boundary still
      // guarantees a usable mapping rather than relying on chance.
      while (this.storage.has(id) || assigned.has(id)) id = this.generateId();
      assigned.add(id);
      return [sourceId, id];
    }));
  }

  /**
   * Inserts one element after portable invariant validation.
   *
   * @param input - Complete type, geometry, layer, and optional props.
   * @returns Complete normalized inserted element.
   * @throws {Error} When the ID exists, the type is empty, or the record is invalid.
   */
  insertElement(input: ElementInput): DocumentElement {
    const id = requireNonemptyId(input.id ?? this.generateId(), "Element");
    if (this.storage.has(id)) throw new Error(`Element ${id} already exists`);
    const validated = this.processElement({ ...input, id });
    this.crdt.transact(() => {
      const model = this.crdt.createDetachedMap<ElementStorage>();
      const frameMap = this.crdt.createDetachedMap<ElementFrameStorage>();
      const props = this.crdt.createDetachedMap<Record<string, CRDTType>>();
      model.set("id", id);
      model.set("type", validated.type);
      model.set("frame", frameMap);
      model.set("zIndex", validated.zIndex);
      model.set("props", props);
      this.storage.set(id, model);
      assignMap(frameMap, validated.frame as ElementFrameStorage);
      assignMap(props, validated.props ?? {});
    });
    return this.result(id, validated);
  }

  /**
   * Patches one element.
   *
   * @param id - Element to patch.
   * @param patch - Mutable geometry, layer, and props.
   * @returns Complete normalized updated element.
   */
  updateElement(id: string, patch: ElementPatch): DocumentElement {
    return this.updateElements([{ id, patch }])[0]!;
  }

  /**
   * Prevalidates and applies multiple element patches in one transaction.
   *
   * Each target is validated as a complete portable element. Duplicate IDs
   * observe preceding patches in the batch.
   *
   * @param updates - Ordered element IDs and partial field updates.
   * @returns Complete normalized updated elements in input order.
   * @throws {Error} When a target is missing or the record is invalid.
   */
  updateElements(updates: readonly ElementUpdate[]): DocumentElement[] {
    const simulated = new Map<string, ElementInput>();
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
    this.crdt.transact(() => prepared.forEach(({ element, patch, validated }) => {
      if (patch.frame) {
        assignMap(this.requiredMap<ElementFrameStorage>(element, "frame"), validated.frame as ElementFrameStorage, false);
      }
      if (patch.zIndex !== undefined) element.set("zIndex", validated.zIndex);
      if (patch.props) {
        const props = this.requiredMap<Record<string, CRDTType>>(element, "props");
        for (const key of Object.keys(patch.props)) {
          const value = validated.props?.[key];
          if (value === undefined) props.delete(key);
          else props.set(key, clone(value) as CRDTType);
        }
      }
    }));
    return prepared.map(({ validated }, index) => this.result(updates[index]!.id, validated));
  }

  /**
   * Removes one element without cascading into blocks or opaque props.
   *
   * @param id - Element identifier to delete.
   * @returns No value.
   */
  removeElement(id: string): void { this.removeElements([id]); }

  /**
   * Removes identified elements in one transaction; missing IDs are harmless.
   *
   * @param ids - Element identifiers to delete.
   * @returns No value.
   */
  removeElements(ids: readonly string[]): void {
    this.crdt.transact(() => ids.forEach((id) => this.storage.delete(id)));
  }

  /**
   * Validates portable elements before destructive snapshot replacement.
   *
   * @param elements - Complete portable element records.
   * @returns No value.
   * @throws {Error} When any element is malformed or duplicated.
   */
  validateElements(elements: readonly DocumentElement[]): void {
    validateElementCollection(elements);
  }

  /**
   * Replaces all elements inside the caller's snapshot transaction.
   *
   * @param elements - Portable elements that become stored canvas records.
   * @returns No value.
   */
  loadElements(elements: readonly DocumentElement[]): void {
    this.validateElements(elements);
    this.storage.clear();
    elements.forEach((element) => this.insertElement(element));
  }

  /**
   * Normalizes one portable element record.
   *
   * @param element - Candidate insert input or reconstructed update.
   * @returns Detached element containing normalized generic fields.
   * @throws {Error} When the type is empty or the record is invalid.
   */
  private processElement(element: ElementInput): ElementInput {
    if (!element.type) throw new Error("Element type is required");
    return {
      ...element,
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
  private result(id: string, element: ElementInput): DocumentElement {
    return {
      id,
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
  private toInput(element: DocumentElement): ElementInput {
    return element;
  }

  /**
   * Materializes one shared record as detached portable element data.
   *
   * @param value - Stored element map.
   * @returns Detached element with normalized geometry.
   */
  private read(value: CRDTMap<ElementStorage>): DocumentElement {
    return {
      id: String(value.get("id")),
      type: String(value.get("type")),
      frame: normalizeElementFrame(this.requiredMap<ElementFrameStorage>(value, "frame").toObject() as unknown as ElementFrame),
      zIndex: normalizeElementZIndex(value.get("zIndex")),
      props: clone(this.requiredMap<Record<IDProp, CRDTType>>(value, "props").toObject() as Record<string, unknown>),
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
    if (!isCRDTMap(value)) throw new Error(`Element ${id} not found`);
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
  private requiredMap<Value extends Record<string, unknown>>(value: CRDTMap<ElementStorage>, key: "frame" | "props"): CRDTMap<Value> {
    const child = value.get(key);
    if (!isCRDTMap(child)) throw new Error(`Element ${String(value.get("id"))} has invalid ${key}`);
    return child as CRDTMap<Value>;
  }
}
