import { assertPortableValue, isPortableRecord, isPortableValue } from "..";

describe("portable values", () => {
  it("accepts primitives, arrays, and plain records", () => {
    expect(isPortableValue(null)).toBe(true);
    expect(isPortableValue(1)).toBe(true);
    expect(isPortableValue("text")).toBe(true);
    expect(isPortableValue(false)).toBe(true);
    expect(isPortableValue([1, { a: "b" }])).toBe(true);
    expect(isPortableValue(Object.create(null))).toBe(true);
    expect(() => assertPortableValue({ nested: { ok: true } })).not.toThrow();
  });

  it("rejects Dates, Maps, typed arrays, class instances, and dangerous keys", () => {
    expect(isPortableValue(new Date())).toBe(false);
    expect(isPortableValue(new Map())).toBe(false);
    expect(isPortableValue(new Uint8Array([1]))).toBe(false);
    expect(isPortableValue(new (class Example {})())).toBe(false);
    expect(isPortableValue(Number.NaN)).toBe(false);
    expect(isPortableValue(undefined)).toBe(false);
    expect(isPortableValue(() => {})).toBe(false);
    expect(isPortableValue({ nested: { prototype: 1 } })).toBe(false);
    expect(() => assertPortableValue(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow(
      /__proto__/,
    );
  });

  it("rejects cycles but accepts a value shared by two branches", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(isPortableValue(cyclic)).toBe(false);
    const shared = { value: 1 };
    expect(isPortableValue({ first: shared, second: shared })).toBe(true);
  });
});

describe("portable records", () => {
  it("accepts only non-array objects of portable data", () => {
    expect(isPortableRecord({ timer: 25, list: [1, "a", null] })).toBe(true);
    expect(isPortableRecord([])).toBe(false);
    expect(isPortableRecord(null)).toBe(false);
    expect(isPortableRecord("text")).toBe(false);
    expect(isPortableRecord({ when: new Date() })).toBe(false);
    expect(isPortableRecord({ constructor: 1 })).toBe(false);
  });
});
