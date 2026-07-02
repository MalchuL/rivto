import { Serializible } from "./crdt";
/**
 * CRDTText is a collaborative text type, optimized for strings and
 * plain-text editing.
 */
export interface CRDTText extends Serializible {
    /**
     * Insert text at the specified position.
     */
    insert(pos: number, text: string): void;

    /**
     * Delete a certain number of characters from the specified position.
     */
    delete(pos: number, length: number): void;

    /**
     * Returns the length of the string.
     */
    get length(): number;

    /**
     * Returns the full content as a JavaScript string.
     */
    toString(): string;
}
