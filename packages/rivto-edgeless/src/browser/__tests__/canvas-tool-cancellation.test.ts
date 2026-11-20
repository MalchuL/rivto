/** @jest-environment jsdom */
import { attachTestBrowserEvents } from "../../test-utils/attach-test-browser-events";
import { jest } from "@jest/globals";
import { CanvasEvents } from "../canvas-events";
import { subscribeCanvasToolCancellation } from "../canvas-tool-cancellation";

test("cancels after input handlers even when they claim their own group", () => {
  const events = new CanvasEvents();
  const root = document.createElement("div");
  document.body.append(root);
  const order: string[] = [];
  events.register({
    id: "input",
    type: "keydown",
    handle: () => {
      order.push("input");
      return "handled";
    },
  });
  events.register({
    id: "blur",
    type: "blur",
    target: "window",
    handle: () => {
      order.push("blur");
      return "handled";
    },
  });
  const reset = jest.fn();
  const cancel = jest.fn(() => {
    order.push("cancel");
    return true;
  });
  const detach = attachTestBrowserEvents(events, root);
  const release = subscribeCanvasToolCancellation(events, { reset }, cancel);
  try {
    const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    root.dispatchEvent(key);
    expect(order).toEqual(["input", "cancel"]);
    expect(key.defaultPrevented).toBe(true);
    expect(reset).not.toHaveBeenCalled();
    order.length = 0;
    window.dispatchEvent(new Event("blur"));
    expect(order).toEqual(["blur", "cancel"]);
    release();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    window.dispatchEvent(new Event("blur"));
    expect(cancel).toHaveBeenCalledTimes(2);
  } finally {
    release();
    detach();
    root.remove();
  }
});

test("uses the attached window and resets the tool when no gesture is captured", () => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const frame = iframe.contentWindow!;
  const root = frame.document.createElement("div");
  frame.document.body.append(root);
  const events = new CanvasEvents();
  const reset = jest.fn();
  const cancel = jest.fn(() => false);
  const detach = attachTestBrowserEvents(events, root);
  const release = subscribeCanvasToolCancellation(events, { reset }, cancel);
  try {
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    expect(reset).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("blur"));
    expect(cancel).toHaveBeenCalledTimes(1);
    frame.dispatchEvent(new Event("blur"));
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(reset).toHaveBeenCalledTimes(1);
  } finally {
    release();
    detach();
    iframe.remove();
  }
});

test("rolls back the Escape observation if blur registration fails", () => {
  const events = new CanvasEvents();
  const releaseDuplicate = events.observe({ id: "canvas.tool.blur", type: "click" }, () => {});
  expect(() =>
    subscribeCanvasToolCancellation(events, { reset: jest.fn() }, () => false),
  ).toThrow();
  const releaseKey = events.observe({ id: "canvas.tool.escape", type: "keydown" }, () => {});
  releaseKey();
  releaseDuplicate();
});
