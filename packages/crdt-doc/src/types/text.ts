import { Serializible } from "./crdt";

export interface CRDTTextDelta {
  insert: string;
  attributes?: Record<string, unknown>;
}
/**
 * CRDTText is a collaborative text type, optimized for strings and
 * plain-text editing.
 */
export interface CRDTText extends Serializible {
  /**
   * Anchors a boundary so concurrent edits can move its offset.
   *
   * @param offset - Valid UTF-16 boundary in attached text.
   * @param association - Defaults to zero, following the next character; -1 follows the preceding character.
   * @returns Opaque serializable position token.
   * @throws If detached or the offset is invalid.
   */
  createRelativePosition(offset: number, association?: -1 | 0): string;
  /**
   * Resolves an anchor against the current text.
   *
   * @param position - Opaque token created for this shared text.
   * @returns Current offset, or undefined when malformed, deleted, or belonging to another text.
   */
  resolveRelativePosition(position: string): number | undefined;

  /**
   * Insert text at the specified position.
   */
  insert(pos: number, text: string, attributes?: Record<string, unknown>): void;

  /**
   * Delete a certain number of characters from the specified position.
   */
  delete(pos: number, length: number): void;

  /** Apply formatting attributes without exposing the native CRDT text. */
  format(pos: number, length: number, attributes: Record<string, unknown>): void;

  /** Return portable rich-text runs. */
  toDelta(): CRDTTextDelta[];

  /**
   * Returns the length of the string.
   */
  get length(): number;

  /**
   * Returns the full content as a JavaScript string.
   */
  toString(): string;
}
