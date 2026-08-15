import { CRDTArray } from "../array";
import { CRDTMap } from "../map";
import { CRDTText } from "../text";
import { CRDTType, BasicType } from "../basic-types";
import { WrapBasicTypeToCRDTOptions } from "./wrapping-options";

export interface CRDTInstantiator {

    /**
     * Creates a new CRDT array not attached to any document.
     * @returns The new CRDT array.
     */
    createArray<Item extends CRDTType = CRDTType>(): CRDTArray<Item>;

    /**
     * Creates a new CRDT map not attached to any document.
     * @returns The new CRDT map.
     */
    createMap<Schema extends object = Record<string, CRDTType>>(): CRDTMap<Schema>;

    /**
     * Creates a new CRDT text not attached to any document.
     * @returns The new CRDT text.
     */
    createText(): CRDTText;

    /**
     * Converts a BasicType to a CRDT type.
     * @param item - The BasicType to wrap.
     * @param options - The options to wrap the BasicType.
     * @returns The wrapped CRDT type.
     */
    convertBasicToCRDTType(item: BasicType, options?: WrapBasicTypeToCRDTOptions): CRDTType;

    /**
     * Checks if a value is a plain record.
     * @param item - The BasicType to check.
     * @returns True if the BasicType is a plain record, false otherwise.
     */
    isPlainRecord(item: BasicType): boolean;
}
