/** @jest-environment jsdom */
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../canvas-viewport";

it("converts client positions with the current camera and attachment", () => {
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  expect(viewport.clientToWorld({ x: 200, y: 240 })).toBeUndefined();
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  const rect = root.getBoundingClientRect();
  Object.defineProperties(rect, { left: { value: 100 }, top: { value: 200 } });
  root.getBoundingClientRect = () => rect;
  const detach = viewport.attach(root, plane);
  canvas.setCamera({ x: 80, y: -20, zoom: 2 });
  expect(viewport.clientToWorld({ x: 200, y: 240 })).toEqual({ x: 10, y: 30 });
  canvas.setCamera({ x: 0, y: 0, zoom: 1 });
  expect(viewport.clientToWorld({ x: 200, y: 240 })).toEqual({ x: 100, y: 40 });
  detach();
  expect(viewport.clientToWorld({ x: 200, y: 240 })).toBeUndefined();
});
