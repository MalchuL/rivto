/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../canvas-viewport";
import { canvasViewportForElement } from "../canvas-viewport-attachment";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

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

test("borrows the host Root and invalidates viewport operations after it detaches", () => {
  const viewport = new CanvasViewport(new Canvas());
  const { root, plane } = layers();
  const occurrence = new BrowserInputRoot(root);
  const other = new BrowserInputRoot(document.createElement("main"));
  try {
    expect(() => viewport.attach(root, plane, other)).toThrow("must match");
    expect(other.isAttached()).toBe(true);
    const detach = viewport.attach(root, plane, occurrence);
    expect(viewport.isAttached()).toBe(true);
    occurrence.detach();
    expect(viewport.isAttached()).toBe(true);
    expect(viewport.clientToWorld({ x: 1, y: 2 })).toBeUndefined();
    detach();
    const replacement = new BrowserInputRoot(root);
    const releaseReplacement = viewport.attach(root, plane, replacement);
    releaseReplacement();
    expect(replacement.isAttached()).toBe(true);
    replacement.detach();
  } finally {
    occurrence.detach();
    other.detach();
  }
});

test("keeps a replacement attached during a borrowed Root ownership check", () => {
  const viewport = new CanvasViewport(new Canvas());
  const first = layers();
  const second = layers();
  let stopSecond: (() => void) | undefined;
  let triggered = false;
  const occurrence = new BrowserInputRoot(first.root, () => {
    if (!triggered) {
      triggered = true;
      stopSecond = viewport.attach(second.root, second.plane);
    }
    return true;
  });
  try {
    expect(() => viewport.attach(first.root, first.plane, occurrence)).toThrow("mounted owner");
    expect(viewport.isAttached()).toBe(true);
    expect(canvasViewportForElement(second.plane)).toBe(viewport);
  } finally {
    stopSecond?.();
    occurrence.detach();
  }
});

test("discards viewport coordinates when the borrowed Root detaches during measurement", () => {
  const viewport = new CanvasViewport(new Canvas());
  const { root, plane } = layers();
  const occurrence = new BrowserInputRoot(root);
  const detach = viewport.attach(root, plane, occurrence);
  const measure = root.getBoundingClientRect.bind(root);
  const spy = jest.spyOn(root, "getBoundingClientRect").mockImplementation(() => {
    const bounds = measure();
    occurrence.detach();
    return bounds;
  });
  try {
    expect(viewport.clientToWorld({ x: 1, y: 2 })).toBeUndefined();
  } finally {
    spy.mockRestore();
    detach();
    occurrence.detach();
  }
});

test("preserves a same-element replacement when stale cleanup runs later", () => {
  const first = new CanvasViewport(new Canvas());
  const second = new CanvasViewport(new Canvas());
  const { root, plane } = layers();
  const firstRoot = new BrowserInputRoot(root);
  const stopFirst = first.attach(root, plane, firstRoot);
  firstRoot.detach();
  expect(canvasViewportForElement(plane)).toBeUndefined();
  const secondRoot = new BrowserInputRoot(root);
  const stopSecond = second.attach(root, plane, secondRoot);
  try {
    expect(canvasViewportForElement(plane)).toBe(second);
    stopFirst();
    expect(canvasViewportForElement(plane)).toBe(second);
    expect(second.isAttached()).toBe(true);
  } finally {
    stopFirst();
    stopSecond();
    secondRoot.detach();
  }
});

test("attachment is exclusive and stale cleanup cannot detach a later mount", () => {
  const viewport = new CanvasViewport(new Canvas());
  const { root, plane } = layers();
  const changed = jest.fn();
  viewport.subscribeAttachment(changed);
  expect(viewport.isAttached()).toBe(false);
  const detach = viewport.attach(root, plane);
  expect(canvasViewportForElement(plane)).toBe(viewport);
  expect(() => viewport.attach(root, plane)).toThrow("mounted owner");
  expect(() => new CanvasViewport(new Canvas()).attach(root, plane)).toThrow("mounted owner");
  detach();
  expect(canvasViewportForElement(plane)).toBeUndefined();
  const detachNext = viewport.attach(root, plane);
  detach();
  expect(viewport.isAttached()).toBe(true);
  expect(canvasViewportForElement(plane)).toBe(viewport);
  expect(changed).toHaveBeenCalledTimes(3);
  detachNext();
  expect(viewport.isAttached()).toBe(false);
});

test("failed attachment withdraws DOM ownership and supports a subsequent attachment", () => {
  const viewport = new CanvasViewport(new Canvas());
  const { root, plane, contains } = layers();
  contains.mockReturnValueOnce(false);
  expect(() => viewport.attach(root, plane)).toThrow("world layer");
  const stop = viewport.subscribeAttachment(() => {
    throw new Error("observer failed");
  });
  expect(() => viewport.attach(root, plane)).toThrow(AggregateError);
  expect(viewport.isAttached()).toBe(false);
  expect(canvasViewportForElement(root)).toBeUndefined();
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
  expect(canvasViewportForElement(innerLayers.plane)).toBe(inner);
  detachInner();
  expect(canvasViewportForElement(innerLayers.plane)).toBe(outer);
  detachOuter();
});
