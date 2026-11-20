/** @jest-environment jsdom */
import { attachTestBrowserEvents } from "../../test-utils/attach-test-browser-events";
import { jest } from "@jest/globals";
import { CanvasEvents } from "../canvas-events";
import { subscribeCanvasControlModifiers } from "../canvas-control-modifiers";

it("tracks key modifiers and blur on the attached window until released", () => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const frame = iframe.contentWindow!;
  const root = frame.document.createElement("div");
  frame.document.body.append(root);
  const events = new CanvasEvents();
  const update = jest.fn();
  const detach = attachTestBrowserEvents(events, root);
  const release = subscribeCanvasControlModifiers(events, "test", update);
  let detachAgain: (() => void) | undefined;
  try {
    window.dispatchEvent(new KeyboardEvent("keydown", { altKey: true }));
    expect(update).not.toHaveBeenCalled();
    frame.dispatchEvent(new KeyboardEvent("keydown", { altKey: true, shiftKey: true }));
    frame.dispatchEvent(new KeyboardEvent("keyup", { altKey: true, shiftKey: false }));
    frame.dispatchEvent(new Event("blur"));
    expect(update.mock.calls).toEqual([
      [true, true],
      [true, false],
      [false, false],
    ]);
    detach();
    frame.dispatchEvent(new KeyboardEvent("keydown", { altKey: true }));
    expect(update).toHaveBeenCalledTimes(3);
    detachAgain = attachTestBrowserEvents(events, root);
    frame.dispatchEvent(new KeyboardEvent("keydown", { altKey: true }));
    expect(update).toHaveBeenLastCalledWith(true, false);
    release();
    release();
    frame.dispatchEvent(new KeyboardEvent("keydown", { altKey: true }));
    expect(update).toHaveBeenCalledTimes(4);
  } finally {
    release();
    detachAgain?.();
    detach();
    iframe.remove();
  }
});

it("rolls back earlier observations if a later registration fails", () => {
  const events = new CanvasEvents();
  const duplicate = events.observe({ id: "test.keyup", type: "keyup", target: "window" }, () => {});
  try {
    expect(() => subscribeCanvasControlModifiers(events, "test", () => {})).toThrow();
    const keydown = events.observe(
      { id: "test.keydown", type: "keydown", target: "window" },
      () => {},
    );
    keydown();
  } finally {
    duplicate();
  }
});
