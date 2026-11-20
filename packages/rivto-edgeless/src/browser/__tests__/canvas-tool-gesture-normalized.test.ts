import { jest } from "@jest/globals";
import { CanvasToolGesture } from "../canvas-tool-gesture";

test("routes normalized pointer data and releases accepted capture", () => {
  const release = jest.fn();
  const capture = jest.fn(() => release);
  const preventDefault = jest.fn();
  const tool = {
    pointerDown: jest.fn(() => true),
    pointerMove: jest.fn(),
    pointerUp: jest.fn(),
    pointerLeave: jest.fn(),
    cancel: jest.fn(() => true),
  };
  const normalize = jest.fn((input: { clientX: number; clientY: number; pointerId: number }) => ({
    point: { x: input.clientX, y: input.clientY },
    pointerId: input.pointerId,
    button: 0,
    shiftKey: false,
    zoom: 1,
    snapping: { snapToGrid: false, alignObjects: false, threshold: 8 },
  }));
  const gesture = new CanvasToolGesture(tool, normalize);
  const input = {
    clientX: 12,
    clientY: 20,
    pointerId: 7,
    button: 0,
    shiftKey: false,
    altKey: false,
  };
  gesture.pointerDown({ ...input, capture, preventDefault });
  expect(capture).toHaveBeenCalledTimes(1);
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(gesture.isCaptured).toBe(true);
  expect(normalize.mock.calls[0]![0]).not.toHaveProperty("nativeEvent");
  gesture.pointerUp(input);
  expect(tool.pointerUp).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  expect(gesture.isCaptured).toBe(false);
});

test("cancels the tool when capture fails after an accepted pointer", () => {
  const tool = {
    pointerDown: jest.fn(() => true),
    pointerMove: jest.fn(),
    pointerUp: jest.fn(),
    pointerLeave: jest.fn(),
    cancel: jest.fn(() => true),
  };
  const gesture = new CanvasToolGesture(tool, () => ({
    point: { x: 0, y: 0 },
    pointerId: 1,
    button: 0,
    shiftKey: false,
    zoom: 1,
    snapping: { snapToGrid: false, alignObjects: false, threshold: 8 },
  }));
  expect(() =>
    gesture.pointerDown({
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      button: 0,
      shiftKey: false,
      altKey: false,
      capture: () => {
        throw new Error("capture failed");
      },
      preventDefault: () => undefined,
    }),
  ).toThrow("capture failed");
  expect(tool.cancel).toHaveBeenCalledTimes(1);
  expect(gesture.isCaptured).toBe(false);
});
