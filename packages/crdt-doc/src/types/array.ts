import { Serializible } from "./crdt";
import { CRDTType, BasicType } from "./basic-types";
import type { CRDTObserveHandler } from "./observe";

/**
 * CRDTArray is an interface for a typed CRDT-backed array-like data type.
 * Methods closely resemble Array, but may include operational transforms and sync.
 * Pass an item type such as `CRDTArray<string>` to constrain inserted values.
 */
export interface CRDTArray<Item extends CRDTType = CRDTType> extends Serializible {
    /**
     * Observe this array and nested shared maps, arrays, and text.
     *
     * Insert/delete on this array uses `{ path: [], keys: [] }`. Nested map
     * edits use the item index as `path[0]` and fill `keys` with map keys.
     *
     * @param handler - Receives one batch of {@link CRDTObserveEvent}s per transaction.
     * @returns Function that removes this observer.
     */
    observe(handler: CRDTObserveHandler): () => void;

    /**
     * Get element at the given index.
     */
    get(index: number): Item | undefined;

    /**
     * Insert one or more items at the given index.
     */
    insert(index: number, ...items: Item[]): void;

    /**
     * Append one or more items to the end of the array.
     */
    push(...items: Item[]): void;

    /**
     * Delete count items starting at the given index.
     * If count is not provided, delete only one item.
     */
    delete(index: number, count?: number): void;

    /**
     * Returns the length of the array.
     */
    get length(): number;

    /** Execute a callback once per item. */
    forEach(callbackfn: (value: Item, index?: number, array?: CRDTArray<Item>) => void): void;

    /**
     * Returns a plain JavaScript array representing this CRDT array's contents.
     */
    toArray(): BasicType[];
}
