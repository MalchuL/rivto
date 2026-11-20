/** @jest-environment jsdom */
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../canvas-viewport";

it("reports the current world origin in client pixels only while attached", () => {
  const viewport = new CanvasViewport(new Canvas());
  expect(viewport.getWorldOriginInClient()).toBeUndefined();
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  const rect = plane.getBoundingClientRect();
  Object.defineProperties(rect, {
    left: { value: 123, configurable: true },
    top: { value: 45, configurable: true },
  });
  plane.getBoundingClientRect = () => rect;
  const detach = viewport.attach(root, plane);
  expect(viewport.getWorldOriginInClient()).toEqual({ x: 123, y: 45 });
  Object.defineProperties(rect, { left: { value: 80 }, top: { value: 30 } });
  expect(viewport.getWorldOriginInClient()).toEqual({ x: 80, y: 30 });
  detach();
  expect(viewport.getWorldOriginInClient()).toBeUndefined();
});

it("stops reading the world origin when the plane leaves the occurrence", () => {
  const viewport = new CanvasViewport(new Canvas());
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  document.body.append(root);
  const detach = viewport.attach(root, plane);
  try {
    expect(viewport.getWorldOriginInClient()).toBeDefined();
    plane.remove();
    expect(viewport.getWorldOriginInClient()).toBeUndefined();
  } finally {
    detach();
    root.remove();
  }
});
