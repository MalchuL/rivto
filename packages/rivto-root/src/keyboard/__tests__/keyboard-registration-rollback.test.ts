/** @jest-environment node */
import { KeyboardRuntime } from "../keyboard-runtime";
import type {
  KeyboardBindingSnapshot,
  KeyboardDefinition,
  KeyboardInput,
  KeyboardTransport,
} from "../types";

/** Independent transport used to exercise keyboard registration ownership. */
const transport: KeyboardTransport<
  KeyboardInput,
  KeyboardDefinition<KeyboardInput>,
  KeyboardBindingSnapshot
> = {
  defaultTarget: "root",
  primaryModifier: "ctrl",
  /**
   * Connects the fixture without external input delivery.
   *
   * @returns A disposer with no transport resources to release.
   */
  connect: () => () => {},
  /**
   * Admits every fixture input.
   *
   * @returns True for every action.
   */
  matches: () => true,
  /**
   * Keeps the fixture inventory unchanged.
   *
   * @param snapshot - Runtime inventory entry.
   * @returns The same inventory entry.
   */
  describe: (snapshot) => snapshot,
  /**
   * Treats fixture actions as potentially overlapping.
   *
   * @returns True for any pair of actions.
   */
  overlaps: () => true,
};

it("releases a keyboard action identity when cleanup ownership fails", () => {
  const failure = new Error("cleanup ownership failed");
  let fail = true;
  const owner = {
    assertActive: () => {},
    registerCleanup: (release: () => void) => {
      if (fail) {
        fail = false;
        throw failure;
      }
      return release;
    },
  };
  const keyboard = new KeyboardRuntime(transport, owner);
  expect(() => keyboard.register({ id: "save", keys: "s" }, () => true)).toThrow(failure);
  expect(keyboard.list()).toEqual([]);
  const release = keyboard.register({ id: "save", keys: "s" }, () => true);
  expect(keyboard.list().map((entry) => entry.id)).toEqual(["save"]);
  release();
  keyboard.destroy();
});

it("does not retain an action whose cleanup runs during registration", () => {
  let eager = true;
  const owner = {
    assertActive: () => {},
    registerCleanup: (release: () => void) => {
      if (eager) {
        eager = false;
        release();
      }
      return release;
    },
  };
  const keyboard = new KeyboardRuntime(transport, owner);
  keyboard.register({ id: "save", keys: "s" }, () => true);
  expect(keyboard.list()).toEqual([]);
  const release = keyboard.register({ id: "save", keys: "s" }, () => true);
  expect(keyboard.list().map((entry) => entry.id)).toEqual(["save"]);
  release();
  keyboard.destroy();
});

it("removes an action when an inventory observer rejects registration", () => {
  const failure = new Error("inventory observer failed");
  const owner = { assertActive: () => {}, registerCleanup: (release: () => void) => release };
  const keyboard = new KeyboardRuntime(transport, owner);
  const unsubscribe = keyboard.subscribe(() => {
    throw failure;
  });
  expect(() => keyboard.register({ id: "save", keys: "s" }, () => true)).toThrow();
  unsubscribe();
  expect(keyboard.list()).toEqual([]);
  const release = keyboard.register({ id: "save", keys: "s" }, () => true);
  release();
  keyboard.destroy();
});

it("removes the action even when its owner disposer also fails", () => {
  const failure = new Error("inventory observer failed");
  const cleanupFailure = new Error("owner cleanup failed");
  let broken = true;
  const owner = {
    assertActive: () => {},
    registerCleanup: (release: () => void) => {
      if (broken) {
        broken = false;
        return () => {
          throw cleanupFailure;
        };
      }
      return release;
    },
  };
  const keyboard = new KeyboardRuntime(transport, owner);
  const unsubscribe = keyboard.subscribe(() => {
    throw failure;
  });
  try {
    keyboard.register({ id: "save", keys: "s" }, () => true);
    throw new Error("Expected registration to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toContain(failure);
    expect((error as AggregateError).errors).toContain(cleanupFailure);
  }
  unsubscribe();
  expect(keyboard.list()).toEqual([]);
  const release = keyboard.register({ id: "save", keys: "s" }, () => true);
  release();
  keyboard.destroy();
});

it("reconciles the inventory after a reentrant keymap update and failed ownership", () => {
  const failure = new Error("cleanup ownership failed");
  let fail = true;
  const owner = {
    assertActive: () => {},
    registerCleanup: (release: () => void) => {
      if (fail) {
        fail = false;
        keyboard.setKeymapOverride("search", ["x"]);
        throw failure;
      }
      return release;
    },
  };
  const keyboard = new KeyboardRuntime(transport, owner);
  expect(() => keyboard.register({ id: "save", keys: "s" }, () => true)).toThrow(failure);
  expect(keyboard.list().map((entry) => entry.id)).toEqual(["search"]);
  const release = keyboard.register({ id: "save", keys: "s" }, () => true);
  release();
  keyboard.destroy();
});

it("does not retain an action if the runtime is destroyed while acquiring ownership", () => {
  const owner = {
    assertActive: () => {},
    registerCleanup: (release: () => void) => {
      keyboard.destroy();
      return release;
    },
  };
  const keyboard = new KeyboardRuntime(transport, owner);
  expect(() => keyboard.register({ id: "save", keys: "s" }, () => true)).toThrow("destroyed");
  expect(keyboard.list()).toEqual([]);
});

it("does not publish an action when the owner destroys the runtime during its active check", () => {
  let checks = 0;
  const owner = {
    assertActive: () => {
      checks += 1;
      if (checks === 2) {
        keyboard.destroy();
      }
    },
    registerCleanup: (release: () => void) => release,
  };
  const keyboard = new KeyboardRuntime(transport, owner);
  expect(() => keyboard.register({ id: "save", keys: "s" }, () => true)).toThrow("destroyed");
  expect(keyboard.list()).toEqual([]);
});
