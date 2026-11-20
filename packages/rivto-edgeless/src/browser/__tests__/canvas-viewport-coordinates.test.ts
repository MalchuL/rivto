/** @jest-environment jsdom */
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../canvas-viewport";
import { canvasViewportAttachment } from "../canvas-viewport-attachment";
import { jest } from "@jest/globals";

it("invalidates coordinate capabilities across remounts of the same root", () => {
  const viewport = new CanvasViewport(new Canvas());
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  const detach = viewport.attach(root, plane);
  const first = canvasViewportAttachment(viewport).get()!.coordinates;
  expect(first).not.toHaveProperty("root");
  expect(first).not.toHaveProperty("plane");
  expect(first.isAttached()).toBe(true);
  expect(first.clientToWorld({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  expect(first.getWorldOriginInClient()).toEqual({ x: 0, y: 0 });
  detach();
  const detachReplacement = viewport.attach(root, plane);
  const replacement = canvasViewportAttachment(viewport).get()!.coordinates;
  expect(first.isAttached()).toBe(false);
  expect(first.clientToWorld({ x: 10, y: 20 })).toBeUndefined();
  expect(first.getWorldOriginInClient()).toBeUndefined();
  expect(replacement.clientToWorld({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  detach();
  expect(replacement.clientToWorld({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  detachReplacement();
  expect(replacement.clientToWorld({ x: 10, y: 20 })).toBeUndefined();
});

it("discards coordinates when a measurement replaces the originating attachment", () => {
  const viewport = new CanvasViewport(new Canvas());
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  let detach = viewport.attach(root, plane);
  const coordinates = canvasViewportAttachment(viewport).get()!.coordinates;
  jest.spyOn(viewport, "clientToWorld").mockImplementation(() => {
    detach();
    detach = viewport.attach(root, plane);
    return { x: 10, y: 20 };
  });
  try {
    expect(coordinates.clientToWorld({ x: 10, y: 20 })).toBeUndefined();
  } finally {
    detach();
  }
});
