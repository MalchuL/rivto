import { HTML_CHANNEL } from "../../constants";
import { isJsonValue } from "../../model/json-value";
import { parseWidgetProps } from "../../model/widget-props";
import { DEFAULT_HTML_SURFACE_LIMITS } from "../../options";
import { parseFrameMessage } from "../frame-messages";

/**
 * Parses a message with the default drag-region limit.
 *
 * @param data - Untrusted message.
 * @param token - Expected document token.
 * @returns The parsed message, or undefined.
 */
function parse(data: unknown, token: string) {
  return parseFrameMessage(data, token, DEFAULT_HTML_SURFACE_LIMITS.maxDragRegions);
}

test("rejects unsafe or non-JSON values in sandbox messages and edited props", () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  expect(isJsonValue(cyclic)).toBe(false);
  expect(() => parseWidgetProps('{"nested":{"constructor":1}}')).toThrow();
  expect(
    parse(
      { channel: HTML_CHANNEL, token: "frame", kind: "set-props", props: { value: cyclic } },
      "frame",
    ),
  ).toBeUndefined();
  expect(
    parse({ channel: HTML_CHANNEL, token: "frame", kind: "resize", height: Infinity }, "frame"),
  ).toBeUndefined();
});

test("rejects structured-clone objects that are not JSON records", () => {
  for (const value of [new Date(), new Map(), new Set(), new Uint8Array([1])]) {
    expect(isJsonValue(value)).toBe(false);
    expect(
      parse(
        { channel: HTML_CHANNEL, token: "frame", kind: "set-prop", key: "value", value },
        "frame",
      ),
    ).toBeUndefined();
  }
});

test("accepts only boolean modifier state for iframe pointer messages", () => {
  expect(
    parse({ channel: HTML_CHANNEL, token: "frame", kind: "pointerdown", primary: true }, "frame"),
  ).toEqual({ kind: "pointerdown", primary: true });
  expect(
    parse({ channel: HTML_CHANNEL, token: "frame", kind: "pointerdown", primary: "yes" }, "frame"),
  ).toBeUndefined();
  expect(
    parse({ channel: HTML_CHANNEL, token: "other", kind: "pointerdown", primary: true }, "frame"),
  ).toBeUndefined();
});

test("clips widget drag regions and rejects malformed frame messages", () => {
  const message = (handles: unknown) => ({
    channel: HTML_CHANNEL,
    token: "frame",
    kind: "drag-handles",
    handles,
  });
  expect(parse(message([{ x: -0.25, y: 0.5, width: 0.5, height: 1 }]), "frame")).toEqual({
    kind: "drag-handles",
    handles: [{ x: 0, y: 0.5, width: 0.25, height: 0.5 }],
  });
  expect(parse(message([{ x: 0, y: 0, width: Infinity, height: 1 }]), "frame")).toBeUndefined();
  expect(parse(message(Array.from({ length: 65 }, () => ({}))), "frame")).toBeUndefined();
  expect(parse(message([]), "another-frame")).toBeUndefined();
});

test("routes unsafe requests and denials through the same envelope check", () => {
  const envelope = { channel: HTML_CHANNEL, token: "frame" };
  expect(
    parse(
      {
        ...envelope,
        kind: "unsafe-request",
        id: 3,
        target: "panel",
        method: "getRootIds",
        args: [],
      },
      "frame",
    ),
  ).toEqual({
    kind: "unsafe-request",
    request: { id: 3, target: "panel", method: "getRootIds", args: [] },
  });
  expect(
    parse({ ...envelope, kind: "unsafe-request", id: 1.5, target: "panel" }, "frame"),
  ).toBeUndefined();
  expect(parse({ ...envelope, kind: "unsafe-denied" }, "frame")).toEqual({
    kind: "unsafe-denied",
  });
  expect(parse({ ...envelope, kind: "unknown" }, "frame")).toBeUndefined();
});

test("frame messages accept JSON writes for this token only", () => {
  const envelope = { channel: HTML_CHANNEL, token: "token" };
  expect(parse({ ...envelope, token: "nope", kind: "ready" }, "token")).toBeUndefined();
  expect(parse({ ...envelope, kind: "ready" }, "token")).toEqual({ kind: "ready" });
  expect(parse({ ...envelope, kind: "set-prop", key: "start", value: true }, "token")).toEqual({
    kind: "set-prop",
    key: "start",
    value: true,
  });
  expect(
    parse({ ...envelope, kind: "set-prop", key: "__proto__", value: {} }, "token"),
  ).toBeUndefined();
  expect(
    parse({ ...envelope, kind: "set-prop", key: "timer", value: Infinity }, "token"),
  ).toBeUndefined();
});

test("a configured drag-region limit rejects longer lists", () => {
  const message = {
    channel: HTML_CHANNEL,
    token: "frame",
    kind: "drag-handles",
    handles: Array.from({ length: 3 }, () => ({ x: 0, y: 0, width: 0.1, height: 0.1 })),
  };
  expect(parseFrameMessage(message, "frame", 2)).toBeUndefined();
  expect(parseFrameMessage(message, "frame", 3)?.kind).toBe("drag-handles");
});
