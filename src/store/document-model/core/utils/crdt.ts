import type { BasicCRDTType, CRDTArray, CRDTMap, CRDTText } from "../../../crdt-doc";
import { clone } from "./clone";

/**
 * Narrows an adapter value to a CRDT map by its required capabilities.
 */
export function isCRDTMap(value: unknown): value is CRDTMap<any> {
    return Boolean(value && typeof value === "object" && "set" in value && "entries" in value);
}

/**
 * Narrows an adapter value to a CRDT array by its required capabilities.
 */
export function isCRDTArray(value: unknown): value is CRDTArray<any> {
    return Boolean(value && typeof value === "object" && "insert" in value && "toArray" in value);
}

/**
 * Narrows an adapter value to collaborative text by its required capabilities.
 */
export function isCRDTText(value: unknown): value is CRDTText {
    return Boolean(value && typeof value === "object" && "format" in value && "toDelta" in value);
}

/**
 * Copies portable object fields into a shared map.
 */
export function assignMap<Schema extends object>(
    map: CRDTMap<Schema>,
    values: Record<string, unknown>,
    clear = true,
): void {
    if (clear) map.clear();
    const writable = map as unknown as CRDTMap<Record<string, BasicCRDTType>>;
    Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined) writable.set(key, clone(value) as BasicCRDTType);
    });
}

/**
 * Replaces collaborative text with plain Markdown source.
 */
export function assignText(text: CRDTText, content: string): void {
    if (text.length) text.delete(0, text.length);
    if (content) text.insert(0, content);
}

/**
 * Copies portable array items into a shared array.
 */
export function assignArray<Item extends BasicCRDTType>(
    array: CRDTArray<Item>,
    values: readonly Item[],
    clear = true,
): void {
    if (clear) array.delete(0, array.length);
    if (values.length) array.insert(clear ? 0 : array.length, ...values);
}
