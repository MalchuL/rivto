/** @jest-environment jsdom */
import { attachTestBrowserEvents } from "../../test-utils/attach-test-browser-events";
import { jest } from "@jest/globals";
import { BrowserEvents } from "@chulane/rivto-root/browser";
import { CanvasToolGesture } from "../canvas-tool-gesture";
import { subscribeCanvasToolInput } from "../canvas-tool-input";

test("routes capture-layer input and retains a captured pointer at the viewport root", () => {
  const root = document.createElement("div");
  const layer = document.createElement("div");
  const child = document.createElement("span");
  const outside = document.createElement("div");
  layer.dataset.toolCapture = "";
  layer.append(child);
  root.append(layer, outside);
  document.body.append(root);
  root.setPointerCapture = jest.fn();
  root.hasPointerCapture = jest.fn(() => true);
  root.releasePointerCapture = jest.fn();
  const tool = {
    pointerDown: jest.fn(() => true),
    pointerMove: jest.fn(),
    pointerUp: jest.fn(),
    pointerLeave: jest.fn(),
    cancel: jest.fn(() => true),
  };
  const gesture = new CanvasToolGesture(tool, (input) => ({
    point: { x: input.clientX, y: input.clientY },
    pointerId: input.pointerId,
    button: input.button,
    shiftKey: input.shiftKey,
    zoom: 1,
    snapping: { snapToGrid: false, alignObjects: false, threshold: 8 },
  }));
  const events = new BrowserEvents();
  const detach = attachTestBrowserEvents(events, root);
  const release = subscribeCanvasToolInput(events, gesture, "[data-tool-capture]", "fixture");
  /**
   * Dispatches one pointer sample with an optional related element.
   *
   * @param target - Event origin inside the viewport.
   * @param type - Pointer phase to dispatch.
   * @param relatedTarget - Element entered by a pointer-out event.
   * @returns Browser listeners have processed the sample.
   */
  function dispatch(target: Element, type: string, relatedTarget?: Element) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, relatedTarget });
    Object.defineProperty(event, "pointerId", { value: 7 });
    target.dispatchEvent(event);
  }
  try {
    dispatch(outside, "pointerdown");
    expect(tool.pointerDown).not.toHaveBeenCalled();
    dispatch(child, "pointerdown");
    expect(root.setPointerCapture).toHaveBeenCalledWith(7);
    dispatch(root, "pointermove");
    dispatch(root, "pointerup");
    expect(tool.pointerMove).toHaveBeenCalledTimes(1);
    expect(tool.pointerUp).toHaveBeenCalledTimes(1);
    expect(root.releasePointerCapture).toHaveBeenCalledWith(7);
    dispatch(child, "pointerout", layer);
    expect(tool.pointerLeave).not.toHaveBeenCalled();
    dispatch(child, "pointerout", outside);
    expect(tool.pointerLeave).toHaveBeenCalledTimes(1);
    release();
    dispatch(child, "pointerdown");
    expect(tool.pointerDown).toHaveBeenCalledTimes(1);
  } finally {
    release();
    detach();
    root.remove();
  }
});
