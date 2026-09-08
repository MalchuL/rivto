import {
  assertPortableValue,
  clone,
  isPortableValue,
  requireNonemptyId,
} from "..";

describe("portable import values", () => {
  it("accepts primitives, arrays, and plain records", () => {
    expect(isPortableValue(null)).toBe(true);
    expect(isPortableValue(1)).toBe(true);
    expect(isPortableValue("text")).toBe(true);
    expect(isPortableValue(false)).toBe(true);
    expect(isPortableValue([1, { a: "b" }])).toBe(true);
    expect(() => assertPortableValue({ nested: { ok: true } })).not.toThrow();
  });

  it("rejects Dates, Maps, typed arrays, class instances, and dangerous keys", () => {
    expect(isPortableValue(new Date())).toBe(false);
    expect(isPortableValue(new Map())).toBe(false);
    expect(isPortableValue(new Uint8Array([1]))).toBe(false);
    expect(isPortableValue(new (class Example {})())).toBe(false);
    expect(isPortableValue(Number.NaN)).toBe(false);
    expect(() => assertPortableValue(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow(/__proto__/);
  });

  it("clones records without copying dangerous keys", () => {
    const source = JSON.parse('{"safe":1,"__proto__":{"polluted":true}}') as Record<string, unknown>;
    const copied = clone(source);
    expect(copied).toEqual({ safe: 1 });
    expect(Object.prototype.hasOwnProperty.call(copied, "__proto__")).toBe(false);
  });

  it("rejects empty and whitespace-only IDs without rewriting valid IDs", () => {
    expect(() => requireNonemptyId("", "Block")).toThrow("Block ID is required");
    expect(() => requireNonemptyId("   ", "Link")).toThrow("Link ID is required");
    expect(requireNonemptyId(" kept ", "Block")).toBe(" kept ");
  });
});
