/** @jest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server.node";
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../../browser/canvas-viewport";
import { CanvasViewportContext } from "../canvas-viewport-context";
import { CanvasWorldPortal } from "../canvas-world-portal";

it("renders world content only while its viewport is attached, including remounts", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const viewport = new CanvasViewport(new Canvas());
  const element = (
    <CanvasViewportContext.Provider value={viewport}>
      <CanvasWorldPortal>
        <span data-world-content>World</span>
      </CanvasWorldPortal>
    </CanvasViewportContext.Provider>
  );
  expect(renderToStaticMarkup(element)).toBe("");
  const container = document.createElement("div");
  const root = createRoot(container);
  const first = document.createElement("div");
  const firstPlane = document.createElement("div");
  first.append(firstPlane);
  const second = document.createElement("div");
  const secondPlane = document.createElement("div");
  second.append(secondPlane);
  try {
    act(() => root.render(element));
    let detach = () => {};
    act(() => {
      detach = viewport.attach(first, firstPlane);
    });
    expect(firstPlane.querySelector("[data-world-content]")?.textContent).toBe("World");
    act(() => detach());
    expect(firstPlane.querySelector("[data-world-content]")).toBeNull();
    act(() => {
      detach = viewport.attach(second, secondPlane);
    });
    expect(secondPlane.querySelector("[data-world-content]")?.textContent).toBe("World");
    act(() => detach());
  } finally {
    act(() => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
