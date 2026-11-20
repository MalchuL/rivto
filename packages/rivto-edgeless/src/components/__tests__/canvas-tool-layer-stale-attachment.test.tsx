/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CanvasViewport } from "../../browser/canvas-viewport";
import { canvasViewportAttachment } from "../../browser/canvas-viewport-attachment";
import { Canvas } from "../../core/canvas";
import { CanvasTool } from "../../core/tools/canvas-tool";
import { CanvasToolLayer } from "../canvas-tool-layer";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";

it.each([false, true])(
  "releases an old gesture after same-element remount, stale move=%s",
  (sendStaleMove) => {
    const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    const canvas = new Canvas();
    const viewport = new CanvasViewport(canvas);
    const tool = new CanvasTool({ id: "fixture" });
    jest.spyOn(tool, "pointerDown").mockReturnValue(true);
    const move = jest.spyOn(tool, "pointerMove");
    const cancel = jest.spyOn(tool, "cancel").mockReturnValue(true);
    const root = document.createElement("div");
    const plane = document.createElement("div");
    const container = document.createElement("div");
    root.append(plane, container);
    document.body.append(root);
    const renderer = createRoot(container);
    let detach = viewport.attach(root, plane);
    const attachment = canvasViewportAttachment(viewport);
    const tools = { reset: jest.fn() };
    const props = {
      canvas,
      rootIdentity: getBrowserElementIdentity(root),
      viewport,
      attachment,
      tool,
      tools,
    };
    try {
      act(() => renderer.render(<CanvasToolLayer {...props} />));
      const layer = container.querySelector("svg")!;
      root.setPointerCapture = jest.fn();
      root.hasPointerCapture = jest.fn(() => true);
      root.releasePointerCapture = jest.fn();
      const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
      Object.defineProperty(down, "pointerId", { value: 7 });
      act(() => layer.dispatchEvent(down));
      const motion = new MouseEvent("pointermove", { bubbles: true, clientX: 50 });
      Object.defineProperty(motion, "pointerId", { value: 7 });
      act(() => {
        detach();
        detach = viewport.attach(root, plane);
        if (sendStaleMove) {
          layer.dispatchEvent(motion);
        }
      });
      expect(move).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalled();
      expect(root.releasePointerCapture).toHaveBeenCalledWith(7);
    } finally {
      act(() => renderer.unmount());
      detach();
      root.remove();
      container.remove();
      environment.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  },
);

it("discards a pointer sample when coordinate conversion replaces the attachment", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  const tool = new CanvasTool({ id: "fixture" });
  const down = jest.spyOn(tool, "pointerDown");
  const root = document.createElement("div");
  const plane = document.createElement("div");
  const container = document.createElement("div");
  root.append(plane, container);
  document.body.append(root);
  const renderer = createRoot(container);
  let detach = viewport.attach(root, plane);
  try {
    act(() =>
      renderer.render(
        <CanvasToolLayer
          canvas={canvas}
          rootIdentity={getBrowserElementIdentity(root)}
          viewport={viewport}
          attachment={canvasViewportAttachment(viewport)}
          tool={tool}
          tools={{ reset: jest.fn() }}
        />,
      ),
    );
    jest.spyOn(viewport, "clientToWorld").mockImplementation(() => {
      detach();
      detach = viewport.attach(root, plane);
      return { x: 10, y: 20 };
    });
    const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: 7 });
    act(() => container.querySelector("svg")!.dispatchEvent(event));
    expect(down).not.toHaveBeenCalled();
  } finally {
    act(() => renderer.unmount());
    detach();
    root.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
