import { CRDTArray } from "../array";
import { CRDTMap } from "../map";
import { CRDTText } from "../text";
import { BasicCRDTType, BasicType } from "../basic-types";
import { WrapBasicTypeToCRDTOptions } from "./wrapping-options";

export interface Instantiator {

    /**
     * Creates a new CRDT array not attached to any document.
     * @returns The new CRDT array.
     */
    createArray(): CRDTArray;

    /**
     * Creates a new CRDT map not attached to any document.
     * @returns The new CRDT map.
     */
    createMap(): CRDTMap;

    /**
     * Creates a new CRDT text not attached to any document.
     * @returns The new CRDT text.
     */
    createText(): CRDTText;

    /**
     * Converts a PlainType to a CRDT type.
     * @param item - The BasicType to wrap.
     * @param options - The options to wrap the BasicType.
     * @returns The wrapped CRDT type.
     */
    plainObjectToCRDT(item: BasicType, options?: WrapBasicTypeToCRDTOptions): BasicCRDTType;

    /**
     * Checks if a value is a plain record.
     * @param item - The BasicType to check.
     * @returns True if the BasicType is a plain record, false otherwise.
     */
    isPlainRecord(item: BasicType): boolean;
}