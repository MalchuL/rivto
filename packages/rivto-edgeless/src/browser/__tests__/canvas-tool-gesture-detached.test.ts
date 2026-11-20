import { jest } from "@jest/globals";
import { CanvasToolGesture } from "../canvas-tool-gesture";
import type { CanvasPointerInput } from "../types";

const sample: CanvasPointerInput = {
  clientX: 12,
  clientY: 20,
  pointerId: 7,
  button: 0,
  shiftKey: false,
  altKey: false,
};

/**
 * Creates a gesture whose viewport can stop providing world coordinates.
 *
 * @returns Gesture, tool spies and a function withdrawing the viewport.
 */
function fixture() {
  const tool = {
    pointerDown: jest.fn(() => true),
    pointerMove: jest.fn(),
    pointerUp: jest.fn(),
    pointerLeave: jest.fn(),
    cancel: jest.fn(() => true),
  };
  let attached = true;
  const gesture = new CanvasToolGesture(tool, (input) =>
    attached
      ? {
          point: { x: input.clientX, y: input.clientY },
          pointerId: input.pointerId,
          button: input.button,
          shiftKey: input.shiftKey,
          zoom: 1,
          snapping: { snapToGrid: false, alignObjects: false, threshold: 8 },
        }
      : undefined,
  );
  const release = jest.fn();
  return {
    gesture,
    tool,
    release,
    /**
     * Makes subsequent pointer normalization unavailable.
     *
     * @returns The fixture no longer supplies viewport coordinates.
     */
    detach() {
      attached = false;
    },
  };
}

test("does not start a gesture when the viewport has detached", () => {
  const state = fixture();
  state.detach();
  const capture = jest.fn(() => state.release);
  state.gesture.pointerDown({ ...sample, capture, preventDefault: jest.fn() });
  expect(state.tool.pointerDown).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
});

test.each(["pointerMove", "pointerUp"] as const)(
  "cancels and releases without committing when %s cannot normalize",
  (method) => {
    const state = fixture();
    state.gesture.pointerDown({
      ...sample,
      capture: () => state.release,
      preventDefault: jest.fn(),
    });
    state.detach();
    state.gesture[method](sample);
    expect(state.tool.cancel).toHaveBeenCalledTimes(1);
    expect(state.tool.pointerUp).not.toHaveBeenCalled();
    expect(state.tool.pointerMove).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledTimes(1);
    expect(state.gesture.isCaptured).toBe(false);
  },
);

test.each(["pointerMove", "pointerUp"] as const)(
  "releases capture when detached %s cancellation throws",
  (method) => {
    const state = fixture();
    state.gesture.pointerDown({
      ...sample,
      capture: () => state.release,
      preventDefault: jest.fn(),
    });
    state.detach();
    state.tool.cancel.mockImplementation(() => {
      throw new Error("cancel failed");
    });
    expect(() => state.gesture[method](sample)).toThrow("cancel failed");
    expect(state.tool.cancel).toHaveBeenCalledTimes(1);
    expect(state.release).toHaveBeenCalledTimes(1);
    expect(state.gesture.isCaptured).toBe(false);
  },
);
