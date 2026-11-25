/**
 * Validation of widget-supplied data before it reaches the document.
 *
 * Everything an HTML widget writes arrives through `postMessage`, which uses the
 * structured-clone algorithm. That accepts much more than JSON (Dates, Maps,
 * typed arrays, cycles), so every value is checked here before a manager stores it.
 *
 * @module
 */

const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Reports whether a property name could pollute a plain object's prototype chain.
 *
 * @param key - Own property name from a widget message or edited JSON object.
 * @returns True for `__proto__`, `constructor` and `prototype`.
 */
export function isPrototypeKey(key: string): boolean {
  return PROTOTYPE_KEYS.has(key);
}

/**
 * Reports whether a property name may be written by a widget.
 *
 * @param key - Candidate property name.
 * @returns True for a nonempty name that is not a prototype key.
 */
export function isWritableKey(key: string): boolean {
  return key.length > 0 && !isPrototypeKey(key);
}

/**
 * Reports whether a value can be stored as JSON-compatible document data.
 *
 * Finite numbers, strings, booleans, null, arrays and plain objects are accepted.
 * Cycles, functions, class instances, non-finite numbers and objects containing
 * prototype keys are rejected.
 *
 * @param value - Candidate value from a sandbox message or the edit form.
 * @returns True when every nested value is portable JSON data.
 */
export function isJsonValue(value: unknown): boolean {
  const ancestors = new Set<object>();
  const visit = (candidate: unknown): boolean => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") {
      return true;
    }
    if (typeof candidate === "number") {
      return Number.isFinite(candidate);
    }
    if (typeof candidate !== "object" || !isPlainContainer(candidate)) {
      return false;
    }
    if (ancestors.has(candidate)) {
      return false;
    }
    ancestors.add(candidate);
    const valid = Array.isArray(candidate)
      ? candidate.every(visit)
      : Object.entries(candidate).every(([key, item]) => !isPrototypeKey(key) && visit(item));
    ancestors.delete(candidate);
    return valid;
  };
  return visit(value);
}

/**
 * Narrows a value to a JSON object a widget may merge onto a node.
 *
 * @param value - Candidate record from a sandbox message or the props editor.
 * @returns True when the value is a non-array object of JSON data.
 */
export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && isJsonValue(value);
}

/**
 * Validates the merged property bag of an HTML canvas element.
 *
 * `undefined` values are allowed so a patch can remove a key. The registry
 * merges defaults before calling this, so `html` is always expected.
 *
 * @param props - Merged element properties, including `html`.
 * @returns The same property record when it is valid.
 * @throws If `html` is missing or any property is not JSON data.
 */
export function validateHtmlElementProps(props: Record<string, unknown>): Record<string, unknown> {
  if (typeof props.html !== "string") {
    throw new Error("HTML element requires an html string");
  }
  for (const [key, value] of Object.entries(props)) {
    if (isPrototypeKey(key) || (value !== undefined && !isJsonValue(value))) {
      throw new Error(`Invalid HTML element property ${key}`);
    }
  }
  return props;
}

/**
 * Reports whether an object is an array or has a plain-object prototype.
 *
 * @param value - Non-null object to inspect.
 * @returns True for arrays, `{}` literals and `Object.create(null)` records.
 */
function isPlainContainer(value: object): boolean {
  if (Array.isArray(value)) {
    return true;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
