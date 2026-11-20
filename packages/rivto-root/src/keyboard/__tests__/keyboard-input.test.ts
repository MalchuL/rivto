/** @jest-environment node */
import { HeldKeyBinding, HeldKeys } from "../held-keys";
import { KeyboardRuntime } from "../keyboard-runtime";
import type {
  KeyboardInput,
  KeyboardTransport,
  KeyboardDefinition,
  KeyboardBindingSnapshot,
  KeyboardResourceOwner,
} from "../types";

it("accepts normalized key data without browser event objects", () => {
  const input: KeyboardInput = {
    keyboard: {
      key: "a",
      code: "KeyA",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      isComposing: false,
    },
    phase: "keydown",
    eventTarget: "root",
  };
  const held = new HeldKeys();
  held.update(input.keyboard, input.phase);
  expect(new HeldKeyBinding(["a"]).matches(held)).toBe(true);
  held.update(input.keyboard, "keyup");
  expect(new HeldKeyBinding(["a"]).matches(held)).toBe(false);
});

let deliver: ((input: KeyboardInput) => boolean) | undefined;
const transport: KeyboardTransport<
  KeyboardInput,
  KeyboardDefinition<KeyboardInput>,
  KeyboardBindingSnapshot
> = {
  defaultTarget: "root",
  primaryModifier: "meta",
  /**
   * Captures the runtime dispatcher for this fixture.
   *
   * @param dispatch - Receiver used to deliver normalized test input.
   * @returns Disposer releasing the captured callback.
   */
  connect(dispatch) {
    deliver = dispatch;
    return () => {
      deliver = undefined;
    };
  },
  /**
   * Allows every fixture input.
   *
   * @returns True for all test actions.
   */
  matches() {
    return true;
  },
  /**
   * Keeps the runtime's fixture inventory unchanged.
   *
   * @param snapshot - Runtime inventory entry.
   * @returns The same entry without host metadata.
   */
  describe(snapshot) {
    return snapshot;
  },
  /**
   * Treats all fixture filters as potentially overlapping.
   *
   * @returns True for any pair of test entries.
   */
  overlaps() {
    return true;
  },
};
const owner: KeyboardResourceOwner = {
  /**
   * Keeps fixture registration available.
   *
   * @returns The fixture remains active.
   */
  assertActive() {},
  /**
   * Returns the fixture's registration cleanup.
   *
   * @param cleanup - Runtime resource release.
   * @returns The same release callback.
   */
  registerCleanup(cleanup) {
    return cleanup;
  },
};

it("dispatches semantic shortcuts and composition policy without browser globals", () => {
  const runtime = new KeyboardRuntime(transport, owner);
  const handler = jest.fn(() => true);
  runtime.register({ id: "save", keys: "Primary+s" }, handler);
  const input: KeyboardInput = {
    keyboard: {
      key: "s",
      code: "KeyS",
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: false,
      isComposing: false,
    },
    phase: "keydown",
    eventTarget: "root",
  };
  expect(deliver!(input)).toBe(true);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(deliver!({ ...input, keyboard: { ...input.keyboard, isComposing: true } })).toBe(false);
  expect(handler).toHaveBeenCalledTimes(1);
  runtime.destroy();
  expect(deliver).toBeUndefined();
});
