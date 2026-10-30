/**
 * Reads one string field out of JSON that is still arriving in fragments.
 *
 * Tool-call arguments stream as raw JSON text. The harness uses this to copy
 * a `content` value into a block before the closing quote exists.
 *
 * @module
 */

/** Decoded string field, and whether its closing quote has arrived. */
export interface JsonStringField {
  readonly value: string;
  readonly closed: boolean;
}

/**
 * Finds `"field":"..."` inside a JSON prefix.
 *
 * Incomplete escape sequences stop the decode and leave `closed` false so the
 * caller waits for the next frame instead of writing a broken character.
 *
 * @param source - JSON text received so far. It may be truncated.
 * @param field - Object key whose string value should be read.
 * @returns The decoded value, or undefined when the key has not started.
 */
export function readJsonStringField(source: string, field: string): JsonStringField | undefined {
  const key = `"${field}":"`;
  const start = source.indexOf(key);
  if (start < 0) return undefined;
  let index = start + key.length;
  let value = "";
  while (index < source.length) {
    const character = source[index]!;
    if (character === "\\") {
      if (index + 1 >= source.length) return { value, closed: false };
      const next = source[index + 1]!;
      if (next === "n") value += "\n";
      else if (next === "r") value += "\r";
      else if (next === "t") value += "\t";
      else if (next === "u") {
        if (index + 5 >= source.length) return { value, closed: false };
        value += String.fromCharCode(Number.parseInt(source.slice(index + 2, index + 6), 16));
        index += 6;
        continue;
      } else value += next;
      index += 2;
      continue;
    }
    if (character === "\"") return { value, closed: true };
    value += character;
    index += 1;
  }
  return { value, closed: false };
}
