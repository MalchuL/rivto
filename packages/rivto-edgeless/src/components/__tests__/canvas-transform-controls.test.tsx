/** @jest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server.node";
import { Canvas } from "../../core/canvas";
import { CanvasTransformAdapter } from "../canvas-transform-adapter";
import { CanvasTransformControls } from "../browser/transform-controls";

it("does not render transform controls without an attached canvas view", () => {
  const canvas = new Canvas();
  const adapter = new CanvasTransformAdapter(canvas, {
    worldRegion: { ancestorAttribute: () => undefined },
    focus: () => {},
  });
  expect(renderToStaticMarkup(<CanvasTransformControls canvas={canvas} adapter={adapter} />)).toBe(
    "",
  );
});
