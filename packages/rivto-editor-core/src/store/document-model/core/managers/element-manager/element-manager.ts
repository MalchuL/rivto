import type { CRDTType, CRDTMap } from "../../../../crdt-doc";
import type {
  DocumentElement,
  DocumentModel,
  ElementFrame,
  ElementInput,
  ElementPatch,
  ElementUpdate,
} from "../../types";
import type { ElementFrameStorage, ElementStorage, IDElement, IDProp } from "../../types/storage";
import { assignMap, assertPortableRecord, assertPortableValue, clone, isCRDTMap, requireNonemptyId } from "../../utils";

const ELEMENTS_KEY = "rivto.editor.elements";

/** Owns generic first-class canvas records without interpreting element types or props. */
export class DocumentElementManager {
  /** Collaborative element container included in document undo history. */
  readonly undoScopes: readonly [CRDTMap<Record<IDElement, CRDTMap<ElementStorage>>>];
  private readonly storage: CRDTMap<Record<IDElement, CRDTMap<ElementStorage>>>;

  /** @param document - Owning document providing CRDT storage and transactions. */
  constructor(private readonly document: DocumentModel) {
    this.storage = document.crdt.getMap<Record<IDElement, CRDTMap<ElementStorage>>>(ELEMENTS_KEY);
    this.undoScopes = [this.storage];
  }

  /** @param id - Stable element ID. @returns Detached element, or undefined when absent. */
  getElement(id: string): DocumentElement | undefined {
    const value = this.storage.get(id);
    return isCRDTMap(value) ? this.read(value) : undefined;
  }

  /** @returns Every detached element in collaborative map iteration order. */
  getElements(): DocumentElement[] {
    return [...this.storage.values()].flatMap((value) => isCRDTMap(value) ? [this.read(value)] : []);
  }

  /** @param input - Complete type, geometry, layer, and optional props. @returns Stable element ID. */
  insertElement(input: ElementInput): string {
    const id = input.id === undefined ? crypto.randomUUID() : requireNonemptyId(input.id, "Element");
    if (!input.type) throw new Error("Element type is required");
    if (this.storage.has(id)) throw new Error(`Element ${id} already exists`);
    this.props(input.props ?? {});
    assertPortableRecord(input.props ?? {}, "element.props");
    const frame = this.frame(input.frame);
    const zIndex = this.zIndex(input.zIndex);
    this.document.transact(() => {
      const model = this.document.crdt.instantiator.createMap<ElementStorage>();
      const frameMap = this.document.crdt.instantiator.createMap<ElementFrameStorage>();
      const props = this.document.crdt.instantiator.createMap<Record<string, CRDTType>>();
      model.set("id", id);
      model.set("type", input.type);
      model.set("frame", frameMap);
      model.set("zIndex", zIndex);
      model.set("props", props);
      this.storage.set(id, model);
      assignMap(frameMap, frame as ElementFrameStorage);
      assignMap(props, input.props ?? {});
    });
    return id;
  }

  /** @param id - Element to patch. @param patch - Mutable geometry, layer, and props. */
  updateElement(id: string, patch: ElementPatch): void {
    this.updateElements([{ id, patch }]);
  }

  /** Prevalidates and applies multiple element patches in one transaction. */
  updateElements(updates: readonly ElementUpdate[]): void {
    const simulatedFrames = new Map<string, ElementFrame>();
    const prepared = updates.map(({ id, patch }) => {
      const element = this.required(id);
      const current = this.read(element);
      const frame = patch.frame ? this.frame({ ...(simulatedFrames.get(id) ?? current.frame), ...patch.frame }) : undefined;
      if (frame) simulatedFrames.set(id, frame);
      const zIndex = patch.zIndex === undefined ? undefined : this.zIndex(patch.zIndex);
      if (patch.props) {
        this.props(patch.props);
        Object.entries(patch.props).forEach(([key, value]) => {
          if (value !== undefined) assertPortableValue(value, `element.props.${key}`);
        });
      }
      return { element, patch, frame, zIndex };
    });
    this.document.transact(() => prepared.forEach(({ element, patch, frame, zIndex }) => {
      if (frame) assignMap(this.requiredMap<ElementFrameStorage>(element, "frame"), frame as ElementFrameStorage, false);
      if (zIndex !== undefined) element.set("zIndex", zIndex);
      if (patch.props) {
        const props = this.requiredMap<Record<string, CRDTType>>(element, "props");
        for (const key of Object.keys(patch.props)) {
          const value = patch.props[key];
          if (value === undefined) props.delete(key);
          else props.set(key, clone(value) as CRDTType);
        }
      }
    }));
  }

  /** Removes one element without cascading into blocks, links, or opaque props. */
  removeElement(id: string): void { this.removeElements([id]); }

  /** Removes identified elements in one transaction; missing IDs are harmless. */
  removeElements(ids: readonly string[]): void {
    this.document.transact(() => ids.forEach((id) => this.storage.delete(id)));
  }

  /** Validates portable elements before destructive snapshot replacement. */
  validateElements(elements: readonly DocumentElement[]): void {
    const ids = new Set<string>();
    elements.forEach((element) => {
      const id = requireNonemptyId(element.id, "Element");
      if (!element.type) throw new Error("Snapshot element ID and type are required");
      if (ids.has(id)) throw new Error(`Duplicate element ${id}`);
      ids.add(id);
      this.frame(element.frame);
      this.zIndex(element.zIndex);
      this.props(element.props);
      assertPortableRecord(element.props, "element.props");
    });
  }

  /** Replaces all elements inside the caller's snapshot transaction. */
  loadElements(elements: readonly DocumentElement[]): void {
    this.validateElements(elements);
    this.storage.clear();
    elements.forEach((element) => this.insertElement(element));
  }

  /** Materializes one shared record as detached portable element data. */
  private read(value: CRDTMap<ElementStorage>): DocumentElement {
    return {
      id: String(value.get("id")),
      type: String(value.get("type")),
      frame: this.frame(this.requiredMap<ElementFrameStorage>(value, "frame").toObject() as unknown as ElementFrame),
      zIndex: this.zIndex(value.get("zIndex")),
      props: clone(this.requiredMap<Record<IDProp, CRDTType>>(value, "props").toObject() as Record<string, unknown>),
    };
  }

  /** Resolves one required shared element record. */
  private required(id: string): CRDTMap<ElementStorage> {
    const value = this.storage.get(id);
    if (!isCRDTMap(value)) throw new Error(`Element ${id} not found`);
    return value;
  }

  /** Resolves one required collaborative child map. */
  private requiredMap<Value extends Record<string, unknown>>(value: CRDTMap<ElementStorage>, key: "frame" | "props"): CRDTMap<Value> {
    const child = value.get(key);
    if (!isCRDTMap(child)) throw new Error(`Element ${String(value.get("id"))} has invalid ${key}`);
    return child as CRDTMap<Value>;
  }

  /** Validates and detaches complete canvas geometry. */
  private frame(value: ElementFrame): ElementFrame {
    if (!value || ![value.x, value.y, value.width, value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0) {
      throw new Error("Element frame requires finite coordinates and positive dimensions");
    }
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  }

  /** Validates one finite layer index. */
  private zIndex(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Element z-index must be finite");
    return value;
  }

  /** Validates the generic element props envelope. */
  private props(value: unknown): asserts value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Element props must be an object");
  }
}
