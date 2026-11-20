/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import type { InputHit } from "@chulane/rivto-root";
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../canvas-viewport";
import { canvasViewportAttachment } from "../canvas-viewport-attachment";

test("hit testing respects viewport ownership, exclusions and remount identity", () => {
  const root = document.createElement("div");
  const plane = document.createElement("div");
  const content = document.createElement("div");
  const control = document.createElement("button");
  const outside = document.createElement("div");
  control.dataset.edgelessUi = "true";
  root.append(plane, content, control);
  document.body.append(root, outside);
  const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  let hit: Element | null = content;
  const elementFromPoint = jest.fn(() => hit);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: elementFromPoint,
  });
  const viewport = new CanvasViewport(new Canvas());
  let detach = viewport.attach(root, plane);
  const first = canvasViewportAttachment(viewport).get()!.coordinates;
  try {
    expect(first.containsClientPoint({ x: 4, y: 7 }, "[data-edgeless-ui]")).toBe(true);
    expect(elementFromPoint).toHaveBeenCalledWith(4, 7);
    hit = control;
    expect(first.containsClientPoint({ x: 4, y: 7 }, "[data-edgeless-ui]")).toBe(false);
    hit = outside;
    expect(first.containsClientPoint({ x: 4, y: 7 })).toBe(false);
    hit = content;
    detach();
    detach = viewport.attach(root, plane);
    const second = canvasViewportAttachment(viewport).get()!.coordinates;
    expect(first.containsClientPoint({ x: 4, y: 7 })).toBe(false);
    expect(second.containsClientPoint({ x: 4, y: 7 })).toBe(true);
  } finally {
    detach();
    root.remove();
    outside.remove();
    if (original) {
      Object.defineProperty(document, "elementFromPoint", original);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});

test("rejects excluded ancestors outside the viewport and releases the captured hit", () => {
  const wrapper = document.createElement("div");
  const root = document.createElement("div");
  const plane = document.createElement("div");
  const target = document.createElement("div");
  wrapper.dataset.excluded = "";
  root.append(plane, target);
  wrapper.append(root);
  document.body.append(wrapper);
  const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
  const occurrence = new BrowserInputRoot(root);
  const documentInput = occurrence.captureDocument()!;
  const hits: InputHit[] = [];
  const capture = jest.fn<typeof documentInput.captureHit>((...args) => {
    const hit = documentInput.captureHit(...args);
    if (hit) {
      hits.push(hit);
    }
    return hit;
  });
  jest.spyOn(occurrence, "captureDocument").mockReturnValue({
    isCurrent: () => documentInput.isCurrent(),
    captureHit: capture,
  });
  const viewport = new CanvasViewport(new Canvas());
  const detach = viewport.attach(root, plane, occurrence);
  const coordinates = canvasViewportAttachment(viewport).get()!.coordinates;
  try {
    expect(coordinates.containsClientPoint({ x: 1, y: 2 }, "[data-excluded]")).toBe(false);
    expect(hits[0]?.isCurrent()).toBe(false);
    expect(() => coordinates.containsClientPoint({ x: 1, y: 2 }, "[")).toThrow();
    expect(hits[1]?.isCurrent()).toBe(false);
  } finally {
    detach();
    occurrence.detach();
    wrapper.remove();
    if (original) {
      Object.defineProperty(document, "elementFromPoint", original);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});

test("discards a hit when hit testing replaces the viewport attachment", () => {
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  document.body.append(root);
  const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const viewport = new CanvasViewport(new Canvas());
  let detach = viewport.attach(root, plane);
  const first = canvasViewportAttachment(viewport).get()!.coordinates;
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => {
      detach();
      detach = viewport.attach(root, plane);
      return plane;
    },
  });
  try {
    expect(first.containsClientPoint({ x: 1, y: 2 })).toBe(false);
    expect(canvasViewportAttachment(viewport).get()!.coordinates).not.toBe(first);
  } finally {
    detach();
    root.remove();
    if (original) {
      Object.defineProperty(document, "elementFromPoint", original);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});

test("treats a nested viewport hit as inside both containing occurrences", () => {
  const outer = document.createElement("div");
  const outerPlane = document.createElement("div");
  const inner = document.createElement("div");
  const innerPlane = document.createElement("div");
  inner.append(innerPlane);
  outer.append(outerPlane, inner);
  document.body.append(outer);
  const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => innerPlane,
  });
  const outerViewport = new CanvasViewport(new Canvas());
  const innerViewport = new CanvasViewport(new Canvas());
  const detachOuter = outerViewport.attach(outer, outerPlane);
  const detachInner = innerViewport.attach(inner, innerPlane);
  try {
    expect(
      canvasViewportAttachment(outerViewport)
        .get()!
        .coordinates.containsClientPoint({ x: 1, y: 2 }),
    ).toBe(true);
    expect(
      canvasViewportAttachment(innerViewport)
        .get()!
        .coordinates.containsClientPoint({ x: 1, y: 2 }),
    ).toBe(true);
  } finally {
    detachInner();
    detachOuter();
    outer.remove();
    if (original) {
      Object.defineProperty(document, "elementFromPoint", original);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});
