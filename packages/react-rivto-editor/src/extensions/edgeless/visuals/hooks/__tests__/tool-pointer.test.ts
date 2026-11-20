/** @jest-environment ./jest-browser-environment.mjs */
import { Canvas } from "@chulane/rivto-edgeless";
import { CanvasViewport } from "@chulane/rivto-edgeless/browser";
import { toolPointer } from "../tool-pointer";

it("reads live viewport coordinates and snapping without browser objects", () => {
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  const rect = root.getBoundingClientRect();
  Object.defineProperties(rect, { left: { value: 100 }, top: { value: 200 } });
  root.getBoundingClientRect = () => rect;
  const detach = viewport.attach(root, plane);
  canvas.setCamera({ x: 80, y: -20, zoom: 2 });
  canvas.setSnapping({ grid: 10, snap: false, align: true });
  root.dataset.edgelessSnap = "true";
  root.dataset.edgelessAlign = "false";
  root.dataset.edgelessGrid = "99";
  const input = {
    clientX: 200,
    clientY: 240,
    pointerId: 7,
    button: 0,
    shiftKey: true,
    altKey: true,
  };
  expect(toolPointer(input, viewport, viewport, 2)).toEqual({
    point: { x: 10, y: 30 },
    pointerId: 7,
    button: 0,
    shiftKey: true,
    zoom: 2,
    snapping: { grid: 10, snapToGrid: false, alignObjects: true, threshold: 4, disabled: true },
  });
  canvas.setSnapping({ grid: 20, snap: true, align: false });
  expect(toolPointer(input, viewport, viewport, 2)?.snapping).toEqual({
    grid: 20,
    snapToGrid: true,
    alignObjects: false,
    threshold: 4,
    disabled: true,
  });
  detach();
  expect(toolPointer(input, viewport, viewport, 2)).toBeUndefined();
});
