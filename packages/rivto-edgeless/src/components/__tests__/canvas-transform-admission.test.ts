/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../../browser/canvas-viewport";
import { canvasViewportAttachment } from "../../browser/canvas-viewport-attachment";
import { CanvasTransformAdapter } from "../canvas-transform-adapter";

it("admits only element targets inside the current world and preserves native Moveable admission", () => {
  const canvas = new Canvas();
  canvas.setElements([
    { id: "item", frame: { x: 0, y: 0, width: 40, height: 40 }, rotation: 0, zIndex: 0 },
  ]);
  const root = document.createElement("div");
  root.tabIndex = -1;
  const plane = document.createElement("div");
  plane.innerHTML =
    '<div data-canvas-element="item"><span>text</span><button>action</button></div>';
  const outside = document.createElement("div");
  outside.dataset.canvasElement = "item";
  root.append(plane, outside);
  document.body.append(root);
  const viewport = new CanvasViewport(canvas);
  const detach = viewport.attach(root, plane);
  const layers = canvasViewportAttachment(viewport).get()!;
  const adapter = new CanvasTransformAdapter(canvas, layers);
  const controls = { prepareDrag: jest.fn(), dragStart: jest.fn(), stop: jest.fn() };
  const stopControls = adapter.registerControls(controls);
  const stopInput = viewport.events.register({
    id: "test.drag",
    type: "mousedown",
    handle: (event) => adapter.startDrag(event),
  });
  const target = plane.querySelector("span")!;
  try {
    target.firstChild!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    plane.querySelector("button")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, ctrlKey: true }));
    expect(controls.dragStart).not.toHaveBeenCalled();
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(canvas.selection.get()).toEqual(["item"]);
    expect(controls.prepareDrag).toHaveBeenCalledWith(["item"]);
    expect(controls.dragStart).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(root);
    detach();
    expect(
      layers.worldRegion.ancestorAttribute(null, "[data-canvas-element]", "data-canvas-element"),
    ).toBeUndefined();
  } finally {
    stopInput();
    stopControls();
    detach();
    root.remove();
  }
});

it("does not admit input owned by a nested canvas occurrence", () => {
  const canvas = new Canvas();
  canvas.setElements([
    { id: "item", frame: { x: 0, y: 0, width: 40, height: 40 }, rotation: 0, zIndex: 0 },
  ]);
  const outer = document.createElement("div");
  const outerPlane = document.createElement("div");
  const inner = document.createElement("div");
  const innerPlane = document.createElement("div");
  innerPlane.innerHTML = '<div data-canvas-element="item"><span>nested</span></div>';
  inner.append(innerPlane);
  outerPlane.append(inner);
  outer.append(outerPlane);
  document.body.append(outer);
  const viewport = new CanvasViewport(canvas);
  const nested = new CanvasViewport(new Canvas());
  const detach = viewport.attach(outer, outerPlane);
  const detachNested = nested.attach(inner, innerPlane);
  const adapter = new CanvasTransformAdapter(canvas, canvasViewportAttachment(viewport).get()!);
  const controls = { prepareDrag: jest.fn(), dragStart: jest.fn(), stop: jest.fn() };
  const stopControls = adapter.registerControls(controls);
  const stopInput = viewport.events.register({
    id: "test.drag",
    type: "mousedown",
    handle: (event) => adapter.startDrag(event),
  });
  try {
    innerPlane.querySelector("span")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(controls.dragStart).not.toHaveBeenCalled();
    expect(canvas.selection.get()).toEqual([]);
  } finally {
    stopInput();
    stopControls();
    detachNested();
    detach();
    outer.remove();
  }
});

it("lets a higher-priority input handler claim a default transform start", () => {
  const canvas = new Canvas();
  canvas.setElements([
    { id: "item", frame: { x: 0, y: 0, width: 40, height: 40 }, rotation: 0, zIndex: 0 },
  ]);
  const root = document.createElement("div");
  const plane = document.createElement("div");
  plane.innerHTML = '<div data-canvas-element="item"></div>';
  root.append(plane);
  const viewport = new CanvasViewport(canvas);
  const detach = viewport.attach(root, plane);
  const adapter = new CanvasTransformAdapter(canvas, canvasViewportAttachment(viewport).get()!);
  const controls = { prepareDrag: jest.fn(), dragStart: jest.fn(), stop: jest.fn() };
  const stopControls = adapter.registerControls(controls);
  const stopClaim = viewport.events.register({
    id: "test.claim",
    type: "mousedown",
    priority: 1,
    handle: () => "handled",
  });
  const stopInput = viewport.events.register({
    id: "test.drag",
    type: "mousedown",
    handle: (event) => adapter.startDrag(event),
  });
  try {
    plane.firstElementChild!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(controls.dragStart).not.toHaveBeenCalled();
    expect(canvas.selection.get()).toEqual([]);
  } finally {
    stopInput();
    stopClaim();
    stopControls();
    detach();
  }
});

it("does not admit input through an old world region after same-element remount", () => {
  const canvas = new Canvas();
  canvas.setElements([
    { id: "item", frame: { x: 0, y: 0, width: 40, height: 40 }, rotation: 0, zIndex: 0 },
  ]);
  const root = document.createElement("div");
  const plane = document.createElement("div");
  plane.innerHTML = '<div data-canvas-element="item"></div>';
  root.append(plane);
  const viewport = new CanvasViewport(canvas);
  const detach = viewport.attach(root, plane);
  const oldAdapter = new CanvasTransformAdapter(canvas, canvasViewportAttachment(viewport).get()!);
  const controls = { prepareDrag: jest.fn(), dragStart: jest.fn(), stop: jest.fn() };
  const stopOldControls = oldAdapter.registerControls(controls);
  const stopOldInput = viewport.events.register({
    id: "old.drag",
    type: "mousedown",
    handle: (event) => oldAdapter.startDrag(event),
  });
  detach();
  const detachReplacement = viewport.attach(root, plane);
  try {
    plane.firstElementChild!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(controls.dragStart).not.toHaveBeenCalled();
    stopOldInput();
    const currentAdapter = new CanvasTransformAdapter(
      canvas,
      canvasViewportAttachment(viewport).get()!,
    );
    const stopCurrentControls = currentAdapter.registerControls(controls);
    const stopCurrentInput = viewport.events.register({
      id: "new.drag",
      type: "mousedown",
      handle: (event) => currentAdapter.startDrag(event),
    });
    try {
      plane.firstElementChild!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(controls.dragStart).toHaveBeenCalledTimes(1);
    } finally {
      stopCurrentInput();
      stopCurrentControls();
    }
  } finally {
    stopOldInput();
    stopOldControls();
    detachReplacement();
  }
});
