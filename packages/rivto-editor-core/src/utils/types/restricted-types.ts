/**
 * RestrictedMap is a type that represents a map with restricted methods.
 * @param K - The key type.
 * @param V - The value type.
 * @returns The restricted map.
 */
export type RestrictedMap<K, V> = Pick<Map<K, V>, 'get'  | 'clear' | 'keys' | 'values' | 'entries'> & {
    delete(key: K): void;
    set(key: K, val: V): RestrictedMap<K, V>;
    get size(): number;
    forEach(callback: (value: V, key: K, map: RestrictedMap<K, V>) => void): void;
};

/**
 * RestrictedArray is a type that represents an array with restricted methods.
 * @param T - The item type.
 * @returns The restricted array.
 */
export type RestrictedArray<T> = Pick<Array<T>,  'length' > & {
    get(index: number): T | undefined;
    insert(index: number, ...items: T[]): void;
    push(...items: T[]): void;
    delete(index: number, count?: number): void;
    forEach(callback: (value: T, index: number, array: RestrictedArray<T>) => void): void;
}

