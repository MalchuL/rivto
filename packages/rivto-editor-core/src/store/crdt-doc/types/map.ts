import { CRDTType, BasicType } from "./basic-types";
import { Serializible } from "./crdt";

/**
 * CRDTMap is a key-value store backed by a CRDT.
 *
 * Pass an object schema to restrict keys and values at compile time:
 * `CRDTMap<{ content: CRDTText; children: CRDTArray<string> }>`.
 */
export interface CRDTMap<Schema extends object = Record<string, CRDTType>> extends Serializible {
    /**
     * Observe this map and its nested shared values without exposing an
     * adapter-specific map or transaction type.
     */
    observe(handler: (events: unknown, transaction: unknown) => void): () => void;

    /**
     * Get the value for a given key.
     */
    get<Key extends keyof Schema & string>(key: Key): Schema[Key] | undefined;

    /**
     * Set the value for a given key.
     */
    set<Key extends keyof Schema & string>(key: Key, val: Schema[Key] & CRDTType): this;

    /**
     * Returns the number of key-value pairs in the map.
     */
    get length(): number;
    get size(): number;

    /**
     * Returns all keys in the map.
     */
    keys(): MapIterator<keyof Schema & string>;

    /**
     * Returns all values in the map.
     */
    values(): MapIterator<Schema[keyof Schema]>;

    /**
     * Returns all entries in the map as [key, value] pairs.
     */
    entries(): MapIterator<[keyof Schema & string, Schema[keyof Schema]]>;

    /**
     * Returns true if the key exists in the map.
     */
    has(key: keyof Schema & string): boolean;

    /**
     * Remove the value for the given key.
     */
    delete(key: keyof Schema & string): void;

    /**
     * Remove all keys and values from the map.
     */
    clear(): void;

    /**
     * Execute a callback for each [key, value] in the map.
     */
    forEach(callbackfn: (value: Schema[keyof Schema], key: keyof Schema & string,
                         map?: CRDTMap<Schema>) => void): void;

    /**
     * Returns a plain JavaScript object representation of this map.
     */
    toObject(): Record<string, BasicType>;

    /**
     * Returns a JSON representation of this map.
     */
    toMap(): Map<string, BasicType>;
}
