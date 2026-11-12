import { HTML_CHANNEL, isJsonValue, parseFrameMessage, parseWidgetProps } from "./protocol";

test("rejects unsafe or non-JSON values in sandbox messages and edited props", () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  expect(isJsonValue(cyclic)).toBe(false);
  expect(() => parseWidgetProps('{"nested":{"constructor":1}}')).toThrow();
  expect(
    parseFrameMessage(
      { channel: HTML_CHANNEL, token: "frame", kind: "set-props", props: { value: cyclic } },
      "frame",
    ),
  ).toBeUndefined();
  expect(
    parseFrameMessage(
      { channel: HTML_CHANNEL, token: "frame", kind: "resize", height: Infinity },
      "frame",
    ),
  ).toBeUndefined();
});

test("rejects structured-clone objects that are not JSON records", () => {
  for (const value of [new Date(), new Map(), new Set(), new Uint8Array([1])]) {
    expect(isJsonValue(value)).toBe(false);
    expect(
      parseFrameMessage(
        { channel: HTML_CHANNEL, token: "frame", kind: "set-prop", key: "value", value },
        "frame",
      ),
    ).toBeUndefined();
  }
});

test("accepts only boolean modifier state for iframe pointer messages", () => {
  expect(
    parseFrameMessage(
      { channel: HTML_CHANNEL, token: "frame", kind: "pointerdown", primary: true },
      "frame",
    ),
  ).toEqual({ kind: "pointerdown", primary: true });
  expect(
    parseFrameMessage(
      { channel: HTML_CHANNEL, token: "frame", kind: "pointerdown", primary: "yes" },
      "frame",
    ),
  ).toBeUndefined();
  expect(
    parseFrameMessage(
      { channel: HTML_CHANNEL, token: "other", kind: "pointerdown", primary: true },
      "frame",
    ),
  ).toBeUndefined();
});
