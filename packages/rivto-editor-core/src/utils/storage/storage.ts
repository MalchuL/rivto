/**
 * A simple generic storage class backed by a Map.
 * Provides methods to set, get, remove, and inspect stored items by key.
 */
export class Storage<T> {
    private storage: Map<string, T> = new Map();

    /**
     * Retrieves the item associated with the provided key.
     * Throws an error if the key is not found.
     * @param key - The item's key.
     * @returns The item of type T.
     */
    getItem(key: string): T {
        const item = this.storage.get(key);
        if (item === undefined) {
            throw new Error(`Item with key ${key} not found`);
        }
        return item;
    }

    /**
     * Stores or updates the item under the specified key.
     * @param key - The key to store the item.
     * @param value - The item to store.
     */
    setItem(key: string, value: T): void {
        this.storage.set(key, value);
    }

    /**
     * Removes the item associated with the provided key.
     * Throws an error if the key does not exist.
     * @param key - The key of the item to remove.
     */
    removeItem(key: string): void {
        if (!this.storage.has(key)) {
            throw new Error(`Item with key ${key} not found`);
        }
        this.storage.delete(key);
    }

    /**
     * Checks if an item with the given key exists.
     * @param key - The key to check.
     * @returns True if the item exists, otherwise false.
     */
    hasItem(key: string): boolean {
        return this.storage.has(key);
    }

    /**
     * Returns the only item in storage.
     * Throws if storage is empty or contains more than one item.
     * @returns The single stored item.
     */
    getOne(): T {
        if (this.storage.size === 0) {
            throw new Error('Storage is empty');
        }
        if (this.storage.size > 1) {
            throw new Error('Storage has multiple items');
        }
        return this.storage.values().next().value!;
    }

    /**
     * Gets the number of items stored.
     */
    get length(): number {
        return this.storage.size;
    }

    /**
     * Removes all items from storage.
     */
    clear(): void {
        this.storage.clear();
    }

    /**
     * Returns an array of all keys in storage.
     * @returns Array of keys as strings.
     */
    keys(): string[] {
        return Array.from(this.storage.keys());
    }

    /**
     * Returns an array of all values in storage.
     * @returns Array of values.
     */
    values(): T[] {
        return Array.from(this.storage.values());
    }

    /**
     * Returns an array of all values in storage (alias for values).
     * @returns Array of values.
     */
    getAll(): T[] {
        return this.values();
    }

    /**
     * Returns an array of all [key, value] pairs in storage.
     * @returns Array of tuples [key, value].
     */
    entries(): [string, T][] {
        return Array.from(this.storage.entries());
    }
    
    /**
     * Executes a provided function once for each [value, key] pair in storage.
     * @param callback - Function to execute for each entry.
     */
    forEach(callback: (value: T, key: string) => void): void {
        this.storage.forEach(callback);
    }

    /**
     * Checks if a key exists in storage (alias for hasItem).
     * @param key - The key to check.
     * @returns True if key exists, otherwise false.
     */
    has(key: string): boolean {
        return this.storage.has(key);
    }
}