/** @jest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { Canvas } from "../../core/canvas";
import { canvasViewportAttachment } from "../../browser/canvas-viewport-attachment";
import { CanvasViewport } from "../../browser/canvas-viewport";
import { useCanvasInput } from "../use-canvas-input";
import type { CanvasInputBinding } from "../types";

/**
 * Connects input for the fixture's selected viewport identity.
 *
 * @param props - Scene, viewport event owner, and expected mounted identity.
 * @param props.canvas - Scene receiving camera changes.
 * @param props.attachment - Read-only source of the current mounted occurrence.
 * @param props.events - Input registrations borrowed from that occurrence.
 * @param props.rootIdentity - Identity expected by the input hook.
 * @returns No visible content.
 */
function Input(props: CanvasInputBinding) {
  useCanvasInput(props);
  return null;
}

it("connects only the matching viewport and releases input when its attachment ends", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  const element = document.createElement("div");
  const plane = document.createElement("div");
  const other = document.createElement("div");
  const container = document.createElement("div");
  element.append(plane);
  document.body.append(element, other, container);
  const renderer = createRoot(container);
  const detach = viewport.attach(element, plane);
  const wheel = () => element.dispatchEvent(new WheelEvent("wheel", { deltaY: 10, bubbles: true }));
  try {
    act(() =>
      renderer.render(
        <Input
          canvas={canvas}
          attachment={canvasViewportAttachment(viewport)}
          events={viewport.events}
          rootIdentity={getBrowserElementIdentity(other)}
        />,
      ),
    );
    act(wheel);
    expect(canvas.camera.get().y).toBe(0);
    act(() =>
      renderer.render(
        <Input
          canvas={canvas}
          attachment={canvasViewportAttachment(viewport)}
          events={viewport.events}
          rootIdentity={getBrowserElementIdentity(element)}
        />,
      ),
    );
    act(wheel);
    expect(canvas.camera.get().y).toBe(-10);
    act(detach);
    act(wheel);
    expect(canvas.camera.get().y).toBe(-10);
  } finally {
    act(() => renderer.unmount());
    detach();
    element.remove();
    other.remove();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
