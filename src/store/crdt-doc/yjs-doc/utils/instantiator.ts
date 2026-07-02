import { BasicCRDTType, BasicType, CRDTArray, CRDTDoc, CRDTMap, CRDTText, Instantiator, WrapBasicTypeToCRDTOptions } from "../../types";
import { YjsArray, YjsMap, YjsText } from "../structures";
import { isDeepPlainRecord } from "../structures/utils/plain-check";
import { basicToCRDT } from "../structures/utils/wrap";
import { YjsDoc } from "../yjs-doc";

export class YjsInstantiator implements Instantiator {


    /**
     * Creates a new CRDT array not attached to any document.
     * @returns The new CRDT array.
     */
    createArray(): CRDTArray {
        return new YjsArray();
    }

    /**
     * Creates a new CRDT map not attached to any document.
     * @returns The new CRDT map.
     */
    createMap(): CRDTMap {
        return new YjsMap();
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
    plainObjectToCRDT(item: BasicType, options?: WrapBasicTypeToCRDTOptions): BasicCRDTType {
        return basicToCRDT(item, options);
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