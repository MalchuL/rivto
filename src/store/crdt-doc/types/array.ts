import { Serializible } from "./crdt";
import { BasicCRDTType, BasicType } from "./basic-types";
import { RestrictedArray } from "../../../utils";

/**
 * CRDTArray is an interface for a CRDT-backed array-like data type.
 * Methods closely resemble Array, but may include operational transforms and sync.
 */
export interface CRDTArray extends Serializible, RestrictedArray<BasicCRDTType> {
    /**
     * Get element at the given index.
     */
    get(index: number): BasicCRDTType | undefined;

    /**
     * Insert one or more items at the given index.
     */
    insert(index: number, ...items: BasicCRDTType[]): void;

    /**
     * Append one or more items to the end of the array.
     */
    push(...items: BasicCRDTType[]): void;

    /**
     * Delete count items starting at the given index.
     * If count is not provided, delete only one item.
     */
    delete(index: number, count?: number): void;

    /**
     * Returns the length of the array.
     */
    get length(): number;

    /**
     * Returns a plain JavaScript array representing this CRDT array's contents.
     */
    toArray(): BasicType[];
}