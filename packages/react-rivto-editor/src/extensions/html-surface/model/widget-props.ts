/**
 * Conversions between persisted widget properties and the source editor's JSON text.
 *
 * @module
 */
import { isPortableRecord, type PortableValue } from "@chulane/rivto-utils";

/**
 * Formats widget props as JSON for the source editor, leaving out keys managed elsewhere.
 *
 * @param props - Current persisted properties.
 * @param omit - Keys edited elsewhere, such as element `html` or canvas `rotation`.
 * @returns Pretty JSON for the remaining keys. Empty props become `{}`.
 */
export function formatWidgetProps(
  props: Record<string, unknown>,
  omit: readonly string[] = [],
): string {
  const data = Object.fromEntries(Object.entries(props).filter(([key]) => !omit.includes(key)));
  return JSON.stringify(data, null, 2);
}

/**
 * Parses the props editor text into a JSON object.
 *
 * @param text - Text from the props field. Blank text means an empty object.
 * @returns The parsed object.
 * @throws If the text is not valid JSON or is not an object of portable values.
 */
export function parseWidgetProps(text: string): Record<string, PortableValue> {
  const parsed = JSON.parse(text.trim() ? text : "{}") as unknown;
  if (!isPortableRecord(parsed)) {
    throw new Error("Props must be a JSON object");
  }
  return parsed;
}

/**
 * Computes the top-level property edits a user made during one editing session.
 *
 * The opening snapshot is the comparison baseline. A key unchanged by this
 * session is omitted from the patch, so applying it preserves the key's latest
 * value in the document. A removed key is reported as `undefined` so the manager
 * deletes it. Each top-level property is one CRDT value, so an edit to a nested
 * field replaces the full value of its top-level key.
 *
 * @param opening - Properties displayed when the editor opened.
 * @param next - Properties submitted by the user.
 * @returns Only the additions, replacements and deletions made in this session.
 */
export function changedPropPatch(
  opening: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(opening), ...Object.keys(next)])) {
    if (!Object.hasOwn(next, key)) {
      patch[key] = undefined;
    } else if (!Object.hasOwn(opening, key) || !sameJsonValue(opening[key], next[key])) {
      patch[key] = next[key];
    }
  }
  return patch;
}

/**
 * Compares two parsed JSON values structurally.
 *
 * Array order matters; object key order does not, so reformatting or
 * reordering keys in the draft does not count as an edit. Both inputs come
 * from validated JSON, so they are acyclic and have only own string keys.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns Whether both represent the same JSON value.
 */
function sameJsonValue(a: PortableValue, b: PortableValue): boolean;
function sameJsonValue(a: unknown, b: unknown): boolean;
function sameJsonValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false;
  }
  const entries = Object.entries(a);
  return (
    entries.length === Object.keys(b).length &&
    entries.every(
      ([key, value]) => Object.hasOwn(b, key) && sameJsonValue(value, Reflect.get(b, key)),
    )
  );
}
