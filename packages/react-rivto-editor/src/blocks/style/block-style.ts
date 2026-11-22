import type { BlockStyle } from "@chulane/rivto-page";

/**
 * Checks whether persisted style data can be read as a property record.
 *
 * Individual fields are checked where they are rendered; unrecognized and
 * malformed values stay in the document when other fields are updated.
 *
 * @param value - Persisted block style of unknown shape.
 * @returns Whether the value is a non-array object containing style properties.
 */
export function isBlockStyle(value: unknown): value is BlockStyle {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
