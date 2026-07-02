export const clone = <T>(value: T): T => {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
        return value.map(clone) as unknown as T;
    }
    const result: Record<string, unknown> = {};
    for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
            result[key] = clone((value as Record<string, unknown>)[key]);
        }
    }
    return result as T;
};
