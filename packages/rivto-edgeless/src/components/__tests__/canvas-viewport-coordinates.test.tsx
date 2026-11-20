/** @jest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../../browser/canvas-viewport";
import type { CanvasViewportCoordinates } from "../../browser/types";
import { CanvasViewportContext, useCanvasViewportCoordinates } from "../canvas-viewport-context";

it("publishes a new coordinate capability for each attachment", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const viewport = new CanvasViewport(new Canvas());
  const observed: Array<CanvasViewportCoordinates | null> = [];
  /**
   * Captures the current attachment capability from context.
   *
   * @returns No visual content; the fixture observes capability identity.
   */
  function Capture() {
    observed.push(useCanvasViewportCoordinates());
    return null;
  }
  const container = document.createElement("div");
  const root = document.createElement("div");
  const plane = root.appendChild(document.createElement("div"));
  const renderer = createRoot(container);
  let detach = () => {};
  try {
    act(() =>
      renderer.render(
        <CanvasViewportContext.Provider value={viewport}>
          <Capture />
        </CanvasViewportContext.Provider>,
      ),
    );
    expect(observed.at(-1)).toBeNull();
    act(() => {
      detach = viewport.attach(root, plane);
    });
    const first = observed.at(-1);
    expect(first).not.toBeNull();
    act(() => {
      detach();
      detach = viewport.attach(root, plane);
    });
    const replacement = observed.at(-1);
    expect(replacement).not.toBe(first);
    expect(first?.clientToWorld({ x: 10, y: 20 })).toBeUndefined();
    expect(replacement?.clientToWorld({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  } finally {
    act(() => {
      detach();
      renderer.unmount();
    });
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
