/**
 * Shared import-boundary rules for portable collaborative values and stable IDs.
 *
 * Snapshot, clipboard, and create/load paths must reject values that cannot
 * round-trip through CRDT storage without corruption. Callers validate first,
 * then clone. This module is the single definition of those rules so block
 * props, plugin data, link meta, and element props cannot drift apart.
 */

/** Own keys that prototype pollution or constructor confusion can smuggle. */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursive JSON-safe value accepted by document import and clone.
 *
 * Dates, Maps, typed arrays, class instances, and non-finite numbers are
 * excluded because they do not survive collaborative storage unchanged.
 */
export type PortableValue =
  | number
  | string
  | boolean
  | null
  | PortableValue[]
  | { readonly [key: string]: PortableValue };

/**
 * Rejects empty and whitespace-only identifiers at create/load boundaries.
 *
 * Accepted IDs are returned exactly as supplied so stable identities are never
 * rewritten. Leading or trailing whitespace on an otherwise nonempty ID is
 * preserved; only strings that are empty after trim are rejected.
 *
 * @param id - Candidate identifier supplied by a caller or snapshot.
 * @param kind - Noun used in the error, such as `Block` or `Link`.
 * @returns The original identifier when it is nonempty.
 * @throws {Error} When the value is not a nonempty string.
 */
export function requireNonemptyId(id: unknown, kind: string): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error(`${kind} ID is required`);
  }
  return id;
}

/**
 * Reports whether a value is a plain record from this or a foreign realm.
 *
 * Foreign-realm objects are accepted when their prototype is `null` or a
 * realm's `Object.prototype`, matching iframe and vm snapshot sources.
 *
 * @param value - Candidate object to inspect.
 * @returns True when the value is a plain record, not an array or instance.
 */
export function isPlainRecord(value: object): boolean {
  if (Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

/**
 * Reports whether a key must never be stored on a portable record.
 *
 * @param key - Own property name to inspect.
 * @returns True when the key is a prototype-pollution or constructor key.
 */
export function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.has(key);
}

/**
 * Narrows an unknown value to a portable primitive, array, or plain record.
 *
 * @param value - Candidate value to inspect.
 * @returns True when every nested value is portable and acyclic.
 */
export function isPortableValue(value: unknown): value is PortableValue {
  try {
    assertPortableValue(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Asserts that a value can be stored and cloned without corruption.
 *
 * @param value - Candidate portable value.
 * @param label - Path used in error messages.
 * @returns No value.
 * @throws {TypeError} When the value is non-portable, cyclic, or uses a
 * dangerous own key.
 */
export function assertPortableValue(value: unknown, label = "value"): asserts value is PortableValue {
  const seen = new Set<object>();
  const visit = (candidate: unknown, path: string): void => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") {
      return;
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) {
        throw new TypeError(`${path} must be a finite number`);
      }
      return;
    }
    if (!candidate || typeof candidate !== "object") {
      throw new TypeError(`${path} must be portable`);
    }
    if (seen.has(candidate)) {
      throw new TypeError(`${path} must not contain cycles`);
    }
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}[${index}]`));
    } else {
      if (!isPlainRecord(candidate)) {
        throw new TypeError(`${path} must be a plain record`);
      }
      for (const key of Object.keys(candidate)) {
        if (isDangerousKey(key)) {
          throw new TypeError(`${path} must not contain ${key}`);
        }
        visit((candidate as Record<string, unknown>)[key], `${path}.${key}`);
      }
    }
    seen.delete(candidate);
  };
  visit(value, label);
}

/**
 * Asserts that a value is a portable plain record.
 *
 * @param value - Candidate record.
 * @param label - Path used in error messages.
 * @returns No value.
 * @throws {TypeError} When the value is not a portable plain record.
 */
export function assertPortableRecord(
  value: unknown,
  label = "value",
): asserts value is Record<string, PortableValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  assertPortableValue(value, label);
}
