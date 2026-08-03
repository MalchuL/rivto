import { BasicType } from "./basic-types";

export interface Serializible {
    /**
     * Serializes the object to a JSON string.
     * @returns The JSON object.
     */
    toJSON(): BasicType;
}
