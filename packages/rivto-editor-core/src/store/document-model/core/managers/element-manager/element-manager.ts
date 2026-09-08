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
import { assignMap, clone, isCRDTMap, requireNonemptyId } from "../../utils";
import { Pipe } from "../../../../../utils/pipe";
import {
  ELEMENT_FRAME_PROCESSOR,
  ELEMENT_PROPS_PROCESSOR,
  ELEMENT_Z_INDEX_PROCESSOR,
  type ElementPipeContext,
} from "./element-pipe";
import {
  normalizeElementFrame,
  normalizeElementZIndex,
  validateElementCollection,
} from "./utils";

const ELEMENTS_KEY = "rivto.editor.elements";

/**
 * Owns generic first-class canvas records without interpreting element types.
 *
 * Geometry, layer, and props envelopes run through `pipe` before writes so
 * plugins can add or replace processors without the storage layer importing
 * registries. Built-in frame, z-index, and props steps are registered at
 * construction and remain replaceable by id.
 */
export class DocumentElementManager {
  /** Collaborative element container included in document undo history. */
  readonly undoScopes: readonly [CRDTMap<Record<IDElement, CRDTMap<ElementStorage>>>];
  /** Priority-ordered processors applied to portable elements before writes. */
  readonly pipe = new Pipe<ElementInput, ElementPipeContext>();
  private readonly storage: CRDTMap<Record<IDElement, CRDTMap<ElementStorage>>>;

  /**
   * Creates an element manager over existing collaborative document storage.
   *
   * @param document - Owning document providing CRDT storage and transactions.
   */
  constructor(private readonly document: DocumentModel) {
    this.storage = document.crdt.getMap<Record<IDElement, CRDTMap<ElementStorage>>>(ELEMENTS_KEY);
    this.undoScopes = [this.storage];
    this.pipe.register(ELEMENT_FRAME_PROCESSOR);
    this.pipe.register(ELEMENT_Z_INDEX_PROCESSOR);
    this.pipe.register(ELEMENT_PROPS_PROCESSOR);
  }

  /**
   * Reads one placed element.
   *
   * @param id - Stable element ID.
   * @returns Detached element, or undefined when absent.
   */
  getElement(id: string): DocumentElement | undefined {
    const value = this.storage.get(id);
    return isCRDTMap(value) ? this.read(value) : undefined;
  }

  /**
   * Materializes every stored element.
   *
   * @returns Every detached element in collaborative map iteration order.
   */
  getElements(): DocumentElement[] {
    return [...this.storage.values()].flatMap((value) => isCRDTMap(value) ? [this.read(value)] : []);
  }

  /**
   * Inserts one element after pipe processing.
   *
   * @param input - Complete type, geometry, layer, and optional props.
   * @returns Stable element ID.
   * @throws {Error} When the ID exists, the type is empty, or a processor rejects the record.
   */
  insertElement(input: ElementInput): string {
    const id = input.id === undefined ? crypto.randomUUID() : requireNonemptyId(input.id, "Element");
    if (this.storage.has(id)) throw new Error(`Element ${id} already exists`);
    const validated = this.processElement({ ...input, id });
    this.document.transact(() => {
      const model = this.document.crdt.instantiator.createMap<ElementStorage>();
      const frameMap = this.document.crdt.instantiator.createMap<ElementFrameStorage>();
      const props = this.document.crdt.instantiator.createMap<Record<string, CRDTType>>();
      model.set("id", id);
      model.set("type", validated.type);
      model.set("frame", frameMap);
      model.set("zIndex", validated.zIndex);
      model.set("props", props);
      this.storage.set(id, model);
      assignMap(frameMap, validated.frame as ElementFrameStorage);
      assignMap(props, validated.props ?? {});
    });
    return id;
  }

  /**
   * Patches one element.
   *
   * @param id - Element to patch.
   * @param patch - Mutable geometry, layer, and props.
   * @returns No value.
   */
  updateElement(id: string, patch: ElementPatch): void {
    this.updateElements([{ id, patch }]);
  }

  /**
   * Prevalidates and applies multiple element patches in one transaction.
   *
   * Each target is processed as a complete portable element so pipe steps see
   * the post-patch record. Duplicate IDs observe preceding patches in the batch.
   *
   * @param updates - Ordered element IDs and partial field updates.
   * @returns No value.
   * @throws {Error} When a target is missing or a processor rejects the record.
   */
  updateElements(updates: readonly ElementUpdate[]): void {
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
    this.document.transact(() => prepared.forEach(({ element, patch, validated }) => {
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
    this.document.transact(() => ids.forEach((id) => this.storage.delete(id)));
  }

  /**
   * Validates portable elements before destructive snapshot replacement.
   *
   * @param elements - Complete portable element records.
   * @returns No value.
   * @throws {Error} When any element is malformed or duplicated.
   */
  validateElements(elements: readonly DocumentElement[]): void {
    validateElementCollection(elements, { pipe: this.pipe });
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
   * Runs the element pipe against one portable record.
   *
   * @param element - Candidate insert input or reconstructed update.
   * @returns The original element or a processor-normalized replacement.
   * @throws {Error} When the type is empty or a processor rejects the record.
   */
  private processElement(element: ElementInput): ElementInput {
    if (!element.type) throw new Error("Element type is required");
    return this.pipe.process(element, {});
  }

  /**
   * Converts a detached element into pipe input without dropping identity.
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
