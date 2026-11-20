import { renderToStaticMarkup } from "react-dom/server";
import { Canvas } from "../../core/canvas";
import type { CanvasViewProps, CanvasWorldLayerProps } from "../../types/canvas-view";
import { CanvasView } from "../canvas-view";

it("renders surface and world presentation without admitting native event props", () => {
  const acceptsViewportPointerHandler: "onPointerDown" extends keyof CanvasViewProps
    ? true
    : false = false;
  const acceptsWorldPointerHandler: "onPointerDown" extends keyof CanvasWorldLayerProps
    ? true
    : false = false;
  const markup = renderToStaticMarkup(
    <CanvasView
      canvas={new Canvas()}
      aria-label="Canvas"
      className="viewport"
      data-surface="example"
      planeProps={{ className: "world", "data-world": "example" }}
    />,
  );
  expect(acceptsViewportPointerHandler).toBe(false);
  expect(acceptsWorldPointerHandler).toBe(false);
  expect(markup).toContain('aria-label="Canvas"');
  expect(markup).toContain('data-surface="example"');
  expect(markup).toContain('class="world"');
  expect(markup).toContain('data-world="example"');
});
