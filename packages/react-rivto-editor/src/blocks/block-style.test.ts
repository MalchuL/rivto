import { isBlockStyle } from "./block-style";

test("accepts records while excluding missing or non-record styles", () => {
  expect(isBlockStyle({ text: { color: "#123456", fontSize: 123 }, future: true })).toBe(true);
  expect(isBlockStyle(null)).toBe(false);
  expect(isBlockStyle([])).toBe(false);
  expect(isBlockStyle("invalid")).toBe(false);
});
