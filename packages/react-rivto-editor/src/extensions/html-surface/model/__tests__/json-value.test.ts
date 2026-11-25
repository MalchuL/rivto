import { isJsonValue, validateHtmlElementProps } from "../json-value";

test("accepts JSON data and rejects values structured clone allows but JSON does not", () => {
  expect(isJsonValue({ timer: 25, start: false, list: [1, "a", null] })).toBe(true);
  expect(isJsonValue(Object.create(null))).toBe(true);
  for (const value of [
    new Date(),
    new Map(),
    NaN,
    undefined,
    () => {},
    { nested: { prototype: 1 } },
  ]) {
    expect(isJsonValue(value)).toBe(false);
  }
  const shared = { a: 1 };
  expect(isJsonValue({ first: shared, second: shared })).toBe(true);
});

test("element props require html and JSON widget data", () => {
  expect(() => validateHtmlElementProps({ label: "HTML" })).toThrow();
  expect(validateHtmlElementProps({ html: "<p></p>", speed: 6 }).speed).toBe(6);
  expect(validateHtmlElementProps({ html: "<p></p>", removed: undefined })).toBeDefined();
  expect(() => validateHtmlElementProps({ html: "<p></p>", speed: Number.NaN })).toThrow();
});
