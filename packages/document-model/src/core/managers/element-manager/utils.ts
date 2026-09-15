import type { ElementFrame, ElementInput } from "../../types";
import { assertPortableRecord, requireNonemptyId } from "../../utils/portable";
import type { ElementPipe } from "./element-pipe";

/**
 * Validates and detaches complete canvas geometry.
 *
 * @param value - Candidate frame record.
 * @returns A detached frame with finite coordinates and positive size.
 * @throws {Error} When any coordinate is non-finite or a dimension is not positive.
 */
export function normalizeElementFrame(value: ElementFrame): ElementFrame {
  if (!value || ![value.x, value.y, value.width, value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0) {
    throw new Error("Element frame requires finite coordinates and positive dimensions");
  }
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

/**
 * Validates one finite layer index.
 *
 * @param value - Candidate z-index.
 * @returns The same finite number.
 * @throws {Error} When the value is not a finite number.
 */
export function normalizeElementZIndex(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Element z-index must be finite");
  return value;
}

/**
 * Validates the generic element props envelope and portability.
 *
 * @param value - Candidate props record, or undefined for empty props.
 * @returns The original record, or an empty object when omitted.
 * @throws {Error} When the value is not a portable plain object.
 */
export function normalizeElementProps(value: unknown): Record<string, unknown> {
  const props = value ?? {};
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    throw new Error("Element props must be an object");
  }
  assertPortableRecord(props, "element.props");
  return props as Record<string, unknown>;
}

/**
 * Validates a portable element collection before a destructive write or paste.
 *
 * Unique nonempty IDs and nonempty types are always required. Geometry, layer,
 * and props are checked either by the supplied pipe or by the built-in
 * normalizers when no pipe is present.
 *
 * @param elements - Candidate element records.
 * @param options - Optional pipe used in place of the built-in normalizers.
 * @returns Collected IDs after a successful preflight.
 * @throws {Error} When any element is malformed or duplicated.
 */
export function validateElementCollection(
  elements: readonly ElementInput[],
  options: { pipe?: ElementPipe } = {},
): Set<string> {
  if (!Array.isArray(elements)) throw new Error("Snapshot elements must be an array");
  const ids = new Set<string>();
  elements.forEach((element) => {
    if (!element || typeof element !== "object" || Array.isArray(element)) {
      throw new Error("Element record is invalid");
    }
    if (!element.type) throw new Error("Element type is required");
    const id = requireNonemptyId(element.id, "Element");
    if (ids.has(id)) throw new Error(`Duplicate element ${id}`);
    ids.add(id);
    if (options.pipe) options.pipe.process(element, {});
    else {
      normalizeElementFrame(element.frame);
      normalizeElementZIndex(element.zIndex);
      normalizeElementProps(element.props);
    }
  });
  return ids;
}
