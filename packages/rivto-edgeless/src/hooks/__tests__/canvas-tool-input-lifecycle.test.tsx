/** @jest-environment jsdom */
import { attachTestBrowserEvents } from "../../test-utils/attach-test-browser-events";
import { jest } from "@jest/globals";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserEvents } from "@chulane/rivto-root/browser";
import { useCanvasToolGesture } from "../use-canvas-tool-gesture";
import type { CanvasToolGestureProps } from "../types";

test("releases capture when the borrowed input registrations change", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const root = document.createElement("div");
  document.body.append(root);
  root.setPointerCapture = jest.fn();
  root.hasPointerCapture = jest.fn(() => true);
  root.releasePointerCapture = jest.fn();
  const first = new BrowserEvents();
  const second = new BrowserEvents();
  const replacement = document.createElement("div");
  document.body.append(replacement);
  const detachFirst = attachTestBrowserEvents(first, root);
  const detachSecond = attachTestBrowserEvents(second, replacement);
  const tool = {
    pointerDown: jest.fn(() => true),
    pointerMove: jest.fn(),
    pointerUp: jest.fn(),
    pointerLeave: jest.fn(),
    cancel: jest.fn(() => true),
  };
  const props: CanvasToolGestureProps = {
    tool,
    events: first,
    captureSelector: "[data-tool-capture]",
    normalize: (input) => ({
      point: { x: input.clientX, y: input.clientY },
      pointerId: input.pointerId,
      button: input.button,
      shiftKey: input.shiftKey,
      zoom: 1,
      snapping: { snapToGrid: false, alignObjects: false, threshold: 8 },
    }),
    subscribeCancellation: () => () => {},
  };
  const renderer = createRoot(root);
  /**
   * Mounts a capture layer using the supplied normalized input source.
   *
   * @param input - Gesture dependencies for the current render.
   * @returns A marked layer inside the registered viewport.
   */
  function Surface(input: CanvasToolGestureProps) {
    useCanvasToolGesture(input);
    return <div data-tool-capture="" />;
  }
  try {
    act(() => renderer.render(<Surface {...props} />));
    const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(down, "pointerId", { value: 7 });
    act(() => root.firstElementChild!.dispatchEvent(down));
    expect(root.setPointerCapture).toHaveBeenCalledWith(7);
    act(() => renderer.render(<Surface {...props} events={second} />));
    expect(root.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(tool.cancel).toHaveBeenCalledTimes(1);
  } finally {
    act(() => renderer.unmount());
    detachFirst();
    detachSecond();
    replacement.remove();
    root.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
