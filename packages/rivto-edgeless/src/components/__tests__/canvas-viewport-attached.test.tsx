/** @jest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server.node";
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../../browser/canvas-viewport";
import { CanvasViewportContext, useCanvasViewportAttached } from "../canvas-viewport-context";

/**
 * Displays whether the surrounding viewport is attached.
 *
 * @returns Attachment state without exposing browser elements.
 */
function Status() {
  return <output>{useCanvasViewportAttached() ? "attached" : "detached"}</output>;
}

it("reports attachment through detach, remount and server rendering", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const viewport = new CanvasViewport(new Canvas());
  const element = (
    <CanvasViewportContext.Provider value={viewport}>
      <Status />
    </CanvasViewportContext.Provider>
  );
  expect(renderToStaticMarkup(element)).toBe("<output>detached</output>");
  const container = document.createElement("div");
  const renderer = createRoot(container);
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  try {
    act(() => renderer.render(element));
    expect(container.textContent).toBe("detached");
    let detach = () => {};
    act(() => {
      detach = viewport.attach(root, plane);
    });
    expect(container.textContent).toBe("attached");
    act(() => detach());
    expect(container.textContent).toBe("detached");
    act(() => {
      detach = viewport.attach(root, plane);
    });
    expect(container.textContent).toBe("attached");
    act(() => detach());
  } finally {
    act(() => renderer.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
