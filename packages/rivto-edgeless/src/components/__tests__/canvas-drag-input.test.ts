/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../../browser/canvas-viewport";
import { CanvasDragInput } from "../../browser/canvas-drag-input";

/**
 * Reads the event only through the library handoff used by the browser adapter.
 *
 * @param input - Adapter bound to the current canvas occurrence.
 * @returns Current native library input, or undefined outside delivery.
 */
function currentInput(input: CanvasDragInput): MouseEvent | TouchEvent | undefined {
  let event: MouseEvent | TouchEvent | undefined;
  input.start(
    {
      current: {
        dragStart: (value) => {
          event = value;
        },
      },
    },
    () => {},
  );
  return event;
}

it("exposes only the currently delivered input and restores an outer reentrant dispatch", () => {
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  document.body.append(root);
  const detach = new CanvasViewport(new Canvas()).attach(root, plane);
  const input = new CanvasDragInput(root);
  const received: Array<MouseEvent | TouchEvent | undefined> = [];
  const outer = new MouseEvent("mousedown", { bubbles: true });
  const inner = new MouseEvent("mousedown", { bubbles: true });
  root.addEventListener("mousedown", (event) => {
    received.push(currentInput(input));
    if (event === outer) {
      plane.dispatchEvent(inner);
      received.push(currentInput(input));
    }
  });
  plane.dispatchEvent(outer);
  expect(received).toEqual([outer, inner, outer]);
  expect(currentInput(input)).toBeUndefined();
  input.destroy();
  plane.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  expect(received.at(-1)).toBeUndefined();
  detach();
  root.remove();
});

it("isolates nested canvas occurrences and releases its native listeners", () => {
  const outer = document.createElement("div");
  const outerPlane = document.createElement("div");
  const inner = document.createElement("div");
  const innerPlane = document.createElement("div");
  outer.append(outerPlane);
  outerPlane.append(inner);
  inner.append(innerPlane);
  document.body.append(outer);
  const detachOuter = new CanvasViewport(new Canvas()).attach(outer, outerPlane);
  const detachInner = new CanvasViewport(new Canvas()).attach(inner, innerPlane);
  const outerInput = new CanvasDragInput(outer);
  const innerInput = new CanvasDragInput(inner);
  const input = new MouseEvent("mousedown", { bubbles: true });
  let outerEvent: MouseEvent | TouchEvent | undefined;
  let innerEvent: MouseEvent | TouchEvent | undefined;
  inner.addEventListener("mousedown", () => {
    outerEvent = currentInput(outerInput);
    innerEvent = currentInput(innerInput);
  });
  innerPlane.dispatchEvent(input);
  expect(outerEvent).toBeUndefined();
  expect(innerEvent).toBe(input);
  outerInput.destroy();
  innerInput.destroy();
  detachInner();
  detachOuter();
  outer.remove();
});

it("keeps touch starts available only during their native delivery", () => {
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  document.body.append(root);
  const detach = new CanvasViewport(new Canvas()).attach(root, plane);
  const input = new CanvasDragInput(root);
  const touch = new TouchEvent("touchstart", { bubbles: true });
  let received: MouseEvent | TouchEvent | undefined;
  root.addEventListener("touchstart", () => {
    received = currentInput(input);
  });
  plane.dispatchEvent(touch);
  expect(received).toBe(touch);
  expect(currentInput(input)).toBeUndefined();
  input.destroy();
  detach();
  root.remove();
});

it("updates modifiers before reading the current Moveable controller", () => {
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  document.body.append(root);
  const detach = new CanvasViewport(new Canvas()).attach(root, plane);
  const input = new CanvasDragInput(root);
  const first = jest.fn();
  const replacement = jest.fn();
  const modifiers = jest.fn();
  const controller = { current: { dragStart: first } };
  const event = new MouseEvent("mousedown", { bubbles: true, altKey: true, shiftKey: true });
  root.addEventListener("mousedown", () => {
    input.start(controller, (alt, shift) => {
      modifiers(alt, shift);
      controller.current = { dragStart: replacement };
    });
  });
  try {
    plane.dispatchEvent(event);
    expect(modifiers).toHaveBeenCalledWith(true, true);
    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledWith(event);
  } finally {
    input.destroy();
    detach();
    root.remove();
  }
});

it("preserves listener setup and rollback failures", () => {
  const setupError = new Error("touch setup failed");
  const rollbackError = new Error("mouse rollback failed");
  const add = jest.spyOn(document, "addEventListener");
  const remove = jest.spyOn(document, "removeEventListener");
  add
    .mockImplementationOnce(() => {})
    .mockImplementationOnce(() => {
      throw setupError;
    });
  remove.mockImplementationOnce(() => {
    throw rollbackError;
  });
  try {
    let failure: unknown;
    try {
      new CanvasDragInput(document.createElement("div"));
    } catch (error) {
      failure = error;
    }
    if (!(failure instanceof AggregateError)) {
      throw new Error("Expected both setup and rollback failures");
    }
    expect(failure.errors).toEqual([setupError, rollbackError]);
  } finally {
    add.mockRestore();
    remove.mockRestore();
  }
});
