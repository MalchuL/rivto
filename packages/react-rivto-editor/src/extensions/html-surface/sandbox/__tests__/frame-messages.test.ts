import { HTML_CHANNEL } from "../../constants";
import { isJsonValue } from "../../model/json-value";
import { parseWidgetProps } from "../../model/widget-props";
import { parseFrameMessage } from "../frame-messages";

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

test("clips widget drag regions and rejects malformed frame messages", () => {
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

test("routes unsafe requests and denials through the same envelope check", () => {
  const envelope = { channel: HTML_CHANNEL, token: "frame" };
  expect(
    parseFrameMessage(
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
    parseFrameMessage({ ...envelope, kind: "unsafe-request", id: 1.5, target: "panel" }, "frame"),
  ).toBeUndefined();
  expect(parseFrameMessage({ ...envelope, kind: "unsafe-denied" }, "frame")).toEqual({
    kind: "unsafe-denied",
  });
  expect(parseFrameMessage({ ...envelope, kind: "unknown" }, "frame")).toBeUndefined();
});

test("frame messages accept JSON writes for this token only", () => {
  const envelope = { channel: HTML_CHANNEL, token: "token" };
  expect(parseFrameMessage({ ...envelope, token: "nope", kind: "ready" }, "token")).toBeUndefined();
  expect(parseFrameMessage({ ...envelope, kind: "ready" }, "token")).toEqual({ kind: "ready" });
  expect(
    parseFrameMessage({ ...envelope, kind: "set-prop", key: "start", value: true }, "token"),
  ).toEqual({ kind: "set-prop", key: "start", value: true });
  expect(
    parseFrameMessage({ ...envelope, kind: "set-prop", key: "__proto__", value: {} }, "token"),
  ).toBeUndefined();
  expect(
    parseFrameMessage({ ...envelope, kind: "set-prop", key: "timer", value: Infinity }, "token"),
  ).toBeUndefined();
});
