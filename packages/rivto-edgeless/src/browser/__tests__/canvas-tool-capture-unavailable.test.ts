import { jest } from "@jest/globals";
import { CanvasToolGesture } from "../canvas-tool-gesture";

test("cancels once when an accepted pointer loses its capture attachment", () => {
  const failure = new Error("cancel failed");
  const tool = {
    pointerDown: jest.fn(() => true),
    pointerMove: jest.fn(),
    pointerUp: jest.fn(),
    pointerLeave: jest.fn(),
    cancel: jest.fn(() => {
      throw failure;
    }),
  };
  const gesture = new CanvasToolGesture(tool, (input) => ({
    point: { x: input.clientX, y: input.clientY },
    pointerId: input.pointerId,
    button: input.button,
    shiftKey: input.shiftKey,
    zoom: 1,
    snapping: { snapToGrid: false, alignObjects: false, threshold: 8 },
  }));
  expect(() =>
    gesture.pointerDown({
      clientX: 1,
      clientY: 2,
      pointerId: 7,
      button: 0,
      shiftKey: false,
      altKey: false,
      capture: () => undefined,
      preventDefault: () => {},
    }),
  ).toThrow(failure);
  expect(tool.cancel).toHaveBeenCalledTimes(1);
  expect(gesture.isCaptured).toBe(false);
});
