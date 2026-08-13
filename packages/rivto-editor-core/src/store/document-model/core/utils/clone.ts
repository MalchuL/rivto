/**
 * Recursively detaches portable arrays and records from CRDT adapter values.
 *
 * @param value - Portable primitive, array, or record to clone.
 * @returns Structurally independent value with the same data.
 */
export function clone<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;
    let result: T;
    if (Array.isArray(value)) {
        // `Array.prototype.map` preserves a foreign realm's constructor. Build
        // a local array so otherwise-portable iframe/vm values are accepted by
        // CRDT adapters that require arrays from their own JavaScript realm.
        result = Array.from(value, (item) => clone(item)) as unknown as T;
    } else {
        const record: Record<string, unknown> = {};
        for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                record[key] = clone((value as Record<string, unknown>)[key]);
            }
        }
        result = record as T;
    }
    return result;
}
