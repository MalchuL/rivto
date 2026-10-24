/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { CanvasControlGeometry } from "./canvas-control-geometry";
import type { CanvasElement } from "../types/canvas";

test("an empty transform selection never scans scene or DOM alignment geometry", () => {
  const read = jest.fn(() => []);
  const plane = document.createElement("div");
  const scan = jest.spyOn(plane, "querySelectorAll");
  const result = CanvasControlGeometry.getAlignmentGuidelines(
    { getElements: read },
    { getTargetIds: () => [] },
    plane,
  );
  expect(result).toEqual({ horizontal: [], vertical: [], elements: [] });
  expect(read).not.toHaveBeenCalled();
  expect(scan).not.toHaveBeenCalled();
});

test("selected targets retain mounted alignment hosts and offscreen edge and center lines", () => {
  const frame = { x: 10, y: 20, width: 100, height: 80 };
  const nodes: CanvasElement[] = [
    { id: "selected", frame, zIndex: 0, rotation: 0 },
    { id: "mounted", frame, zIndex: 0, rotation: 0 },
    { id: "offscreen", frame: { ...frame, x: 1000 }, zIndex: 0, rotation: 0 },
    { id: "hidden", frame, zIndex: 0, rotation: 0, render: false },
  ];
  const plane = document.createElement("div");
  const host = document.createElement("div");
  host.dataset.canvasElement = "mounted";
  plane.append(host);
  const result = CanvasControlGeometry.getAlignmentGuidelines(
    { getElements: () => nodes },
    { getTargetIds: () => ["selected"] },
    plane,
  );
  expect(result.elements).toEqual([host]);
  expect(result.horizontal).toEqual([20, 60, 100]);
  expect(result.vertical).toEqual([1000, 1050, 1100]);
});
