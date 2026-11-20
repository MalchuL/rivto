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

it("cancels and releases a captured tool gesture when the occurrence root changes", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  const tool = new CanvasTool({ id: "fixture" });
  const cancel = jest.spyOn(tool, "cancel").mockReturnValue(true);
  jest.spyOn(tool, "pointerDown").mockReturnValue(true);
  const tools = { reset: jest.fn() };
  const first = document.createElement("div");
  const second = document.createElement("div");
  const container = document.createElement("div");
  const firstPlane = document.createElement("div");
  const secondPlane = document.createElement("div");
  first.append(firstPlane, container);
  second.append(secondPlane);
  document.body.append(first, second);
  const renderer = createRoot(container);
  let detach = viewport.attach(first, firstPlane);
  const attachment = canvasViewportAttachment(viewport);
  const props = {
    canvas,
    viewport,
    tool,
    tools,
    rootIdentity: getBrowserElementIdentity(first),
    attachment,
  };
  try {
    act(() => renderer.render(<CanvasToolLayer {...props} />));
    const layer = container.querySelector("svg")!;
    first.setPointerCapture = jest.fn();
    first.hasPointerCapture = jest.fn(() => true);
    first.releasePointerCapture = jest.fn();
    const pointer = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(pointer, "pointerId", { value: 7 });
    act(() => layer.dispatchEvent(pointer));
    expect(tool.pointerDown).toHaveBeenCalledTimes(1);
    act(() => {
      detach();
      detach = viewport.attach(second, secondPlane);
      renderer.render(
        <CanvasToolLayer {...props} rootIdentity={getBrowserElementIdentity(second)} />,
      );
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(first.releasePointerCapture).toHaveBeenCalledWith(7);
  } finally {
    act(() => renderer.unmount());
    detach();
    first.remove();
    second.remove();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
