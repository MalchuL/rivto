import { BlockKeyboardEvent } from "../block-keyboard-event";
import type { BlockInputEvent } from "../../events/types";

it("constructs keyboard context from normalized input without native browser context", () => {
  const preventDefault = jest.fn();
  const input: BlockInputEvent<"keydown"> = {
    root: {
      captureDocument: jest.fn(() => undefined),
      captureRegionByIdentity: jest.fn(() => undefined),
      createLineOverlay: () => ({ isCurrent: () => true, update: () => true, remove: () => {} }),
      createTextOverlay: jest.fn(() => ({
        isCreated: jest.fn(() => false),
        create: jest.fn(() => true),
        move: jest.fn(),
        remove: jest.fn(),
      })),
      captureDocumentAttribute: () => ({ set: () => true, removeWhenAbsent: () => {} }),
      isAttached: jest.fn(() => true),
      isConnected: jest.fn(() => true),
      isInSameDocument: jest.fn(() => true),
      findRegions: jest.fn(() => []),
      captureFrameClock: jest.fn(() => undefined),
      clearSelection: jest.fn(),
      focus: jest.fn(),
    },
    input: {
      type: "keydown",
      defaultPrevented: false,
      target: null,
      key: "a",
      code: "KeyA",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      isComposing: false,
      repeat: false,
      preventDefault,
      stopPropagation: () => undefined,
    },
    eventTarget: "root",
    insideRoot: true,
    targetIsRoot: true,
    blockId: null,
    preventDefault,
    stopPropagation: () => undefined,
  };
  const event = new BlockKeyboardEvent(input, "keydown", "ctrl");
  expect(event.keyboard.key).toBe("a");
  expect(event.targetIsRoot).toBe(true);
  event.preventDefault();
  expect(preventDefault).toHaveBeenCalledTimes(1);
});
