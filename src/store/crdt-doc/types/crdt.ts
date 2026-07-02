import { BasicType } from "./basic-types";
import { WrapBasicTypeToCRDTOptions } from "./utils";

export interface Serializible {
    /**
     * Serializes the object to a JSON string.
     * @returns The JSON object.
     */
    toJSON(): BasicType;
}