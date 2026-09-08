import { CRDTType, BasicType, CRDTArray, CRDTMap, CRDTText, CRDTInstantiator, WrapBasicTypeToCRDTOptions } from "../../types";
import { YjsArray, YjsMap, YjsText } from "../structures";
import { isDeepPlainRecord } from "../structures/utils/plain-check";
import { wrapBasicTypeToCRDTType } from "../structures/utils/wrap";

export class YjsInstantiator implements CRDTInstantiator {


    /**
     * Creates a new CRDT array not attached to any document.
     * @returns The new CRDT array.
     */
    createArray<Item extends CRDTType = CRDTType>(): CRDTArray<Item> {
        return new YjsArray<Item>();
    }

    /**
     * Creates a new CRDT map not attached to any document.
     * @returns The new CRDT map.
     */
    createMap<Schema extends object = Record<string, CRDTType>>(): CRDTMap<Schema> {
        return new YjsMap<Schema>();
    }

    /**
     * Creates a new CRDT text not attached to any document.
     * @returns The new CRDT text.
     */
    createText(): CRDTText {
        return new YjsText();
    }

    /**
     * Converts a plain object to a CRDT type.
     * @param item - The plain object to convert.
     * @param options - The options to convert the plain object to a CRDT type.
     * @returns The converted CRDT type.
     */
    convertBasicToCRDTType(item: BasicType, options?: WrapBasicTypeToCRDTOptions): CRDTType {
        return wrapBasicTypeToCRDTType(item, options);
    }

    /**
     * Checks if a value is a plain record.
     * @param item - The value to check.
     * @returns True if the value is a plain record, false otherwise.
     */
    isPlainRecord(item: BasicType): boolean {
        return isDeepPlainRecord(item);
    }
}
