/**
 * Identity rules shared by document create, load and paste boundaries.
 */

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
export function requireNonemptyId(id: string, kind: string): string;
export function requireNonemptyId(id: unknown, kind: string): string;
export function requireNonemptyId(id: unknown, kind: string): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error(`${kind} ID is required`);
  }
  return id;
}
