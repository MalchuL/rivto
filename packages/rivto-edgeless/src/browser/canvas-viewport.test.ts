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
  expect(CanvasViewport.forElement(plane)).toBe(viewport);
  expect(() => viewport.attach(root, plane)).toThrow("mounted owner");
  expect(() => new CanvasViewport(new Canvas()).attach(root, plane)).toThrow("mounted owner");
  detach();
  expect(CanvasViewport.forElement(plane)).toBeUndefined();
  const detachNext = viewport.attach(root, plane);
  detach();
  expect(viewport.layers.get()?.root).toBe(root);
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
