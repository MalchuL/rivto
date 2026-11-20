/** @jest-environment ./jest-browser-environment.mjs */
import { Canvas } from "@chulane/rivto-edgeless";
import { CanvasViewport } from "@chulane/rivto-edgeless/browser";

it("converts positions using the live camera and viewport, not DOM attributes", () => {
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  const rect = root.getBoundingClientRect();
  Object.defineProperties(rect, { left: { value: 10 }, top: { value: 20 } });
  root.getBoundingClientRect = () => rect;
  root.dataset.edgelessZoom = "2";
  root.dataset.edgelessPanX = "0";
  root.dataset.edgelessPanY = "0";
  const detach = viewport.attach(root, plane);
  try {
    canvas.setCamera({ x: 90, y: -30, zoom: 1.5 });
    expect(viewport.clientToWorld({ x: 250, y: 140 })).toEqual({ x: 100, y: 100 });
  } finally {
    detach();
    canvas.dispose();
  }
});
