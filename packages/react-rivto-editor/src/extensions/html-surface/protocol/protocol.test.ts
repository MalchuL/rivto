import {
  HTML_CHANNEL,
  clampFrameHeight,
  isJsonValue,
  parseFrameMessage,
  parseWidgetProps,
} from "./protocol";

test("allows small iframe heights while bounding invalid and oversized measurements", () => {
  expect(clampFrameHeight(0)).toBe(0);
  expect(clampFrameHeight(24.4)).toBe(24);
  expect(clampFrameHeight(-1)).toBe(0);
  expect(clampFrameHeight(900)).toBe(720);
});

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

test("clips embedded drag regions and rejects malformed frame messages", () => {
  const message = (handles: unknown) => ({
    channel: HTML_CHANNEL,
    token: "frame",
    kind: "drag-handles",
    handles,
  });
  expect(
    parseFrameMessage(message([{ x: -0.25, y: 0.5, width: 0.5, height: 1 }]), "frame"),
  ).toEqual({ kind: "drag-handles", handles: [{ x: 0, y: 0.5, width: 0.25, height: 0.5 }] });
  expect(
    parseFrameMessage(message([{ x: 0, y: 0, width: Infinity, height: 1 }]), "frame"),
  ).toBeUndefined();
  expect(
    parseFrameMessage(message(Array.from({ length: 65 }, () => ({}))), "frame"),
  ).toBeUndefined();
  expect(parseFrameMessage(message([]), "another-frame")).toBeUndefined();
});
