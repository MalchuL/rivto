/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { Canvas } from "../core/canvas";
import { CanvasViewport } from "./canvas-viewport";

/**
 * Supplies real DOM elements for attachment and listener lifecycle tests.
 *
 * @returns Distinct root and child identities with a controllable containment check.
 */
function layers() {
  const root = document.createElement("main");
  const plane = document.createElement("div");
  root.append(plane);
  const contains = jest.spyOn(root, "contains");
  return { root, plane, contains };
}

test("attachment is exclusive and stale cleanup cannot detach a later mount", () => {
  const viewport = new CanvasViewport(new Canvas());
  const { root, plane } = layers();
  const changed = jest.fn();
  viewport.layers.subscribe(changed);
  expect(viewport.layers.get()).toBeNull();
  const detach = viewport.attach(root, plane);
  viewport.setPanState(true, true);
  expect(viewport.panState).toEqual({ ready: true, active: true });
  expect(CanvasViewport.forElement(plane)).toBe(viewport);
  expect(() => viewport.attach(root, plane)).toThrow("mounted owner");
  expect(() => new CanvasViewport(new Canvas()).attach(root, plane)).toThrow("mounted owner");
  detach();
  expect(viewport.panState).toEqual({ ready: false, active: false });
  expect(CanvasViewport.forElement(plane)).toBeUndefined();
  const detachNext = viewport.attach(root, plane);
  viewport.setPanState(true, false);
  detach();
  expect(viewport.layers.get()?.root).toBe(root);
  expect(viewport.panState).toEqual({ ready: true, active: false });
  expect(changed).toHaveBeenCalledTimes(3);
  detachNext();
  expect(viewport.layers.get()).toBeNull();
});

test("failed attachment withdraws DOM ownership and supports a subsequent attachment", () => {
  const viewport = new CanvasViewport(new Canvas());
  const { root, plane, contains } = layers();
  contains.mockReturnValueOnce(false);
  expect(() => viewport.attach(root, plane)).toThrow("world layer");
  const stop = viewport.layers.subscribe(() => {
    throw new Error("observer failed");
  });
  expect(() => viewport.attach(root, plane)).toThrow(AggregateError);
  expect(viewport.layers.get()).toBeNull();
  expect(CanvasViewport.forElement(root)).toBeUndefined();
  stop();
  viewport.attach(root, plane)();
});

test("nearest nested viewport wins without replacing the outer attachment", () => {
  const outer = new CanvasViewport(new Canvas());
  const inner = new CanvasViewport(new Canvas());
  const outerLayers = layers();
  const innerLayers = layers();
  Object.defineProperty(innerLayers.root, "parentElement", { value: outerLayers.plane });
  const detachOuter = outer.attach(outerLayers.root, outerLayers.plane);
  const detachInner = inner.attach(innerLayers.root, innerLayers.plane);
  expect(CanvasViewport.forElement(innerLayers.plane)).toBe(inner);
  detachInner();
  expect(CanvasViewport.forElement(innerLayers.plane)).toBe(outer);
  detachOuter();
});

test("converts viewport scrolling to camera movement and releases the listener", () => {
  const canvas = new Canvas();
  canvas.setCamera({ x: 15, y: -10, zoom: 2 });
  const viewport = new CanvasViewport(canvas);
  const { root, plane } = layers();
  const detach = viewport.attach(root, plane);
  root.scrollLeft = 40;
  root.scrollTop = 30;
  root.dispatchEvent(new Event("scroll"));
  expect([root.scrollLeft, root.scrollTop]).toEqual([0, 0]);
  expect(canvas.camera.get()).toEqual({ x: -25, y: -40, zoom: 2 });
  plane.dispatchEvent(new Event("scroll", { bubbles: true }));
  expect(canvas.camera.get()).toEqual({ x: -25, y: -40, zoom: 2 });
  detach();
  root.scrollTop = 20;
  root.dispatchEvent(new Event("scroll"));
  expect(root.scrollTop).toBe(20);
  expect(canvas.camera.get()).toEqual({ x: -25, y: -40, zoom: 2 });
});
