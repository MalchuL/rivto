/** @jest-environment ./jest-browser-environment.mjs */
import { Canvas } from "@chulane/rivto-edgeless";
import { CanvasViewport } from "@chulane/rivto-edgeless/browser";
import { toolPointer } from "../tool-pointer";

it("does not invent a canvas origin when the viewport is detached", () => {
  const viewport = new CanvasViewport(new Canvas());
  const input = {
    clientX: 10,
    clientY: 20,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
  };
  expect(toolPointer(input, viewport, viewport, 1)).toBeUndefined();
});
