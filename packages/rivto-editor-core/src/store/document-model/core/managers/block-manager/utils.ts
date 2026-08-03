import type { CRDTArray } from "../../../../crdt-doc";
import type { BlockInput } from "../../types";

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

/**
 * Validates and resolves a persisted block collapse value.
 *
 * @param value - Candidate persisted collapse state.
 * @param fallback - Value used only when the candidate is undefined.
 * @returns A validated boolean collapse state.
 * @throws {TypeError} When neither a boolean value nor a fallback is available.
 */
export function collapsedFrom(value: unknown, fallback?: boolean): boolean {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "boolean") throw new TypeError("block.collapsed must be a boolean");
  return value;
}
