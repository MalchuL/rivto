/** @jest-environment jsdom */
import { findCanvasControlTargets } from "../canvas-control-targets";

it("finds unique mounted participants in document order and ignores other worlds", () => {
  const plane = document.createElement("div");
  plane.innerHTML =
    '<div data-canvas-element="first"></div><div data-canvas-element="second"></div><div data-canvas-element="first"></div>';
  const outside = document.createElement("div");
  outside.dataset.canvasElement = "missing";
  document.body.append(plane, outside);
  const children = [...plane.children];
  expect(findCanvasControlTargets(plane, ["second", "first", "missing"])).toEqual([
    children[0],
    children[1],
  ]);
  expect(findCanvasControlTargets(plane, [])).toEqual([]);
  plane.remove();
  outside.remove();
});
