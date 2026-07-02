import { RestrictedMap } from "@/utils";
import { BasicCRDTType, BasicType } from "./basic-types";
import { Serializible } from "./crdt";

/**
 * CRDTMap is a key-value store backed by a CRDT. It supports string keys.
 */
export interface CRDTMap extends Serializible, RestrictedMap<string, BasicCRDTType> {
    /**
     * Get the value for a given key.
     */
    get(key: string): BasicCRDTType | undefined;

    /**
     * Set the value for a given key.
     */
    set(key: string, val: BasicCRDTType): this;

    /**
     * Returns the number of key-value pairs in the map.
     */
    get length(): number;
    get size(): number;

    /**
     * Returns all keys in the map.
     */
    keys(): MapIterator<string>;

    /**
     * Returns all values in the map.
     */
    values(): MapIterator<BasicCRDTType>;

    /**
     * Returns all entries in the map as [key, value] pairs.
     */
    entries(): MapIterator<[string, BasicCRDTType]>;

    /**
     * Returns true if the key exists in the map.
     */
    has(key: string): boolean;

    /**
     * Remove the value for the given key.
     */
    delete(key: string): void;

    /**
     * Remove all keys and values from the map.
     */
    clear(): void;

    /**
     * Execute a callback for each [key, value] in the map.
     */
    forEach(callbackfn: (value: BasicCRDTType, key: string, 
                         map: CRDTMap) => void): void;

    /**
     * Returns a plain JavaScript object representation of this map.
     */
    toObject(): Record<string, BasicType>;

    /**
     * Returns a JSON representation of this map.
     */
    toMap(): Map<string, BasicType>;
}