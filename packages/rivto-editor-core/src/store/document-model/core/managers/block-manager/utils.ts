import type { CRDTArray } from "../../../../crdt-doc";
import type { BlockInput } from "../../types";

/**
 * Opaque properties interpreted by page/outline extensions.
 * Core persists this record without assigning meaning to individual keys.
 */
export type BlockListProps = Record<string, unknown>;

/**
 * Validates an opaque list-property record before it reaches CRDT storage.
 *
 * Accepted values are finite numbers, strings, booleans, null, arrays, and
 * recursively nested plain records. The function validates without transforming
 * the supplied record.
 *
 * @param value - Candidate top-level list-property record.
 * @returns The original value narrowed to `BlockListProps` after validation.
 * @throws {TypeError} When the top level is not a record or a nested value is
 * unsupported, non-finite, non-plain, or cyclic.
 */
export function validateBlockListProps(value: unknown): BlockListProps {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("block.listProps must be an object");
  }
  const seen = new Set<object>();
  const validate = (candidate: unknown): void => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return;
    if (typeof candidate === "number" && Number.isFinite(candidate)) return;
    if (!candidate || typeof candidate !== "object") throw new TypeError("block.listProps values must be portable");
    if (seen.has(candidate)) throw new TypeError("block.listProps values must not contain cycles");
    seen.add(candidate);
    if (Array.isArray(candidate)) candidate.forEach(validate);
    else {
      const prototype = Object.getPrototypeOf(candidate) as object | null;
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) {
        throw new TypeError("block.listProps values must be plain records");
      }
      Object.values(candidate as Record<string, unknown>).forEach(validate);
    }
    seen.delete(candidate);
  };
  validate(value);
  return value as BlockListProps;
}

/**
 * Materializes string identifiers from a collaborative array.
 *
 * This helper keeps adapter-specific array conversion out of tree algorithms.
 *
 * @param array - Collaborative array containing block identifiers.
 * @returns Detached string identifiers in collaborative order.
 */
export function strings(array: CRDTArray<string>): string[] {
  return array.toArray().map(String);
}

/**
 * Converts optional block content into its persisted string representation.
 *
 * @param content - Optional content supplied during block creation.
 * @returns Supplied content, or an empty string when content is omitted.
 */
export function contentFrom(content: BlockInput["content"]): string {
  return content ?? "";
}
