/**
 * Checks if a value is a deep plain record.
 * A deep plain record is a record that only contains primitive values and other deep plain records.
 * @param value - The value to check.
 * @param visited - The visited objects.
 * @returns True if the value is a deep plain record, false otherwise.
 */
export function isDeepPlainRecord(
  value: unknown,
  visited = new WeakSet<object>()
): value is Record<string, any> {
  if (typeof value !== "object" || value === null) return false;

  // prevent circular references
  if (visited.has(value)) return false;
  visited.add(value);

  // allow arrays, but check their contents
  if (Array.isArray(value)) {
    return value.every(v => isDeepPlainRecord(v, visited) || isPrimitive(v));
  }

  // must be plain object
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;

  for (const v of Object.values(value)) {
    if (typeof v === "function") return false;

    if (
      typeof v === "object" &&
      v !== null &&
      !isDeepPlainRecord(v, visited)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a value is a primitive.
 * @param v - The value to check.
 * @returns True if the value is a primitive, false otherwise.
 */
function isPrimitive(v: unknown): boolean {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}