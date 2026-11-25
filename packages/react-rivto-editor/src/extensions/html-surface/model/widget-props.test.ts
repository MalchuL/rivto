import { changedPropPatch, formatWidgetProps, parseWidgetProps, readLabel } from "./widget-props";

test("draft patches omit equivalent JSON and can delete keys inherited by plain objects", () => {
  const patch = changedPropPatch(
    { toString: "old", settings: { a: 1, b: [true] }, steps: [1, 2] },
    { settings: { b: [true], a: 1 }, steps: [2, 1] },
  );
  expect(Object.hasOwn(patch, "toString")).toBe(true);
  expect(patch).toStrictEqual({ toString: undefined, steps: [2, 1] });
});

test("element edits patch only what changed and keep host-owned keys out of the JSON", () => {
  const current = { html: "<p></p>", rotation: 15, speed: 6, color: "#111111" };
  const patch = changedPropPatch(current, { html: "<b></b>", speed: 8, rotation: 15 });
  expect(patch).toStrictEqual({ html: "<b></b>", speed: 8, color: undefined });
  expect(formatWidgetProps(current, ["html", "rotation"])).not.toMatch(/html|rotation/);
  expect(parseWidgetProps('{"timer":25,"start":false}')).toEqual({ timer: 25, start: false });
  expect(parseWidgetProps("  ")).toEqual({});
  expect(() => parseWidgetProps("[]")).toThrow();
  expect(readLabel({ label: "  Timer " }, "HTML")).toBe("Timer");
  expect(readLabel({ label: " " }, "HTML")).toBe("HTML");
});
