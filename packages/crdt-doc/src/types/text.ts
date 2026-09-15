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
