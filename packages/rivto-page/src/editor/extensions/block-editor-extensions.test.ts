import type { BlockEditorExtension } from "./types";
import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";

let editor: BlockEditorController;

beforeEach(() => {
  editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
});
afterEach(() => editor.destroy());

it("installs the same extension under different IDs with independent resources and cleanup", () => {
  const cleanup = jest.fn();
  const extension: BlockEditorExtension = {
    /**
     * Creates a separate slot for each installation of the shared extension.
     *
     * @param api - Editor capturing the slot in the current setup scope.
     * @returns Cleanup observed independently for each installation.
     */
    setup: jest.fn((api) => {
      api.slots.register({ position: "end", component: () => null });
      return cleanup;
    }),
  };
  const removeFirst = editor.extensions.register("first", extension);
  editor.extensions.register("second", extension);
  const [, secondSlot] = editor.slots.getSnapshot();
  expect(extension.setup).toHaveBeenCalledTimes(2);
  expect(editor.slots.getSnapshot()).toHaveLength(2);
  removeFirst();
  removeFirst();
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(editor.slots.getSnapshot()).toEqual([secondSlot]);
  editor.destroy();
  expect(cleanup).toHaveBeenCalledTimes(2);
  expect(editor.slots.getSnapshot()).toEqual([]);
});

it("keeps an earlier installation when reusing an extension fails during setup", () => {
  const cleanup = jest.fn();
  let installations = 0;
  const extension: BlockEditorExtension = {
    /**
     * Creates a slot and fails only during the second installation.
     *
     * @param api - Editor capturing the slot before the simulated setup failure.
     * @returns Cleanup for successful installations.
     * @throws On the second invocation, after its slot has been registered.
     */
    setup: jest.fn((api) => {
      api.slots.register({ position: "end", component: () => null });
      installations += 1;
      if (installations === 2) {
        throw new Error("second installation failed");
      }
      return cleanup;
    }),
  };
  editor.extensions.register("first", extension);
  const firstSnapshot = editor.slots.getSnapshot();
  expect(() => editor.extensions.register("second", extension)).toThrow(AggregateError);
  expect(editor.slots.getSnapshot()).toEqual(firstSnapshot);
  expect(cleanup).not.toHaveBeenCalled();
  editor.extensions.register("second", extension);
  expect(editor.slots.getSnapshot()).toHaveLength(2);
});

it("removes captured slots, renderers, and event observers after custom cleanup exactly once", () => {
  const observed = jest.fn();
  const cleanup = jest.fn(() => {
    expect(editor.slots.getSnapshot()).toHaveLength(1);
    expect(editor.renderers.get("text")).toBeDefined();
  });
  const remove = editor.extensions.register("feature", {
    setup: () => {
      editor.slots.register({ position: "end", component: () => null });
      editor.renderers.register("text", { content: () => null });
      editor.events.on("focus", observed);
      return cleanup;
    },
  });
  const root = document.createElement("div");
  const detach = editor.attach(root);
  root.dispatchEvent(new FocusEvent("focusin"));
  expect(observed).toHaveBeenCalledTimes(1);
  remove();
  remove();
  root.dispatchEvent(new FocusEvent("focusin"));
  expect(observed).toHaveBeenCalledTimes(1);
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(editor.slots.getSnapshot()).toEqual([]);
  expect(editor.renderers.get("text")).toBeUndefined();
  detach();
});

it("rolls back failed setup and nested extensions, then permits retrying their IDs", () => {
  const failure = new Error("setup failed");
  const nestedCleanup = jest.fn();
  expect(() =>
    editor.extensions.register("outer", {
      setup: () => {
        editor.slots.register({ position: "start", component: () => null });
        editor.extensions.register("nested", {
          setup: () => {
            editor.renderers.register("text", { content: () => null });
            return nestedCleanup;
          },
        });
        editor.slots.register({ position: "end", component: () => null });
        throw failure;
      },
    }),
  ).toThrow(AggregateError);
  expect(editor.slots.getSnapshot()).toEqual([]);
  expect(editor.renderers.get("text")).toBeUndefined();
  expect(nestedCleanup).toHaveBeenCalledTimes(1);
  editor.extensions.register("outer", { setup: () => undefined });
  editor.extensions.register("nested", { setup: () => undefined });
});

it("restores the parent scope after nested setup and retains independent features", () => {
  editor.slots.register({ position: "body", component: () => null });
  const removeOuter = editor.extensions.register("outer", {
    setup: () => {
      editor.extensions.register("inner", {
        setup: () => {
          editor.renderers.register("text", { content: () => null });
        },
      });
      editor.slots.register({ position: "end", component: () => null });
    },
  });
  removeOuter();
  expect(editor.renderers.get("text")).toBeUndefined();
  expect(editor.slots.getSnapshot().map((entry) => entry.position)).toEqual(["body"]);
});

it("attempts all captured cleanups after errors and makes removal idempotent", () => {
  const releases: string[] = [];
  const remove = editor.extensions.register("throwing", {
    setup: () => {
      editor.extensions.registerCleanup(() => releases.push("first"));
      editor.extensions.registerCleanup(() => {
        releases.push("second");
        throw new Error("owned failure");
      });
      return () => {
        releases.push("custom");
        throw new Error("custom failure");
      };
    },
  });
  let failure: AggregateError | undefined;
  try {
    remove();
  } catch (error) {
    failure = error as AggregateError;
  }
  expect(failure?.errors).toHaveLength(2);
  expect(releases).toEqual(["custom", "second", "first"]);
  expect(() => remove()).not.toThrow();
  editor.extensions.register("throwing", { setup: () => undefined });
});

it("rejects empty and duplicate IDs without invoking setup", () => {
  const setup = jest.fn();
  expect(() => editor.extensions.register(" ", { setup })).toThrow("Invalid");
  const remove = editor.extensions.register("same", { setup });
  expect(() => editor.extensions.register("same", { setup })).toThrow("duplicate");
  expect(setup).toHaveBeenCalledTimes(1);
  remove();
  editor.extensions.register("same", { setup });
  expect(setup).toHaveBeenCalledTimes(2);
});

it("releases direct registrations and external cleanup despite a failing extension teardown", () => {
  const release = jest.fn();
  const Component = () => null;
  editor.renderers.register("direct", { content: Component });
  editor.slots.register({ position: "body", component: Component });
  editor.extensions.registerCleanup(release);
  editor.extensions.register("throwing", {
    setup: () => () => {
      throw new Error("cleanup failed");
    },
  });
  expect(() => editor.destroy()).toThrow(AggregateError);
  expect(release).toHaveBeenCalledTimes(1);
  expect(editor.renderers.get("direct")).toBeUndefined();
  expect(editor.slots.getSnapshot()).toEqual([]);
  expect(() => editor.slots.register({ position: "end", component: Component })).toThrow(
    "destroyed",
  );
  expect(() => editor.renderers.register("new", { content: Component })).toThrow("destroyed");
  expect(() => editor.extensions.register("new", { setup: () => undefined })).toThrow("destroyed");
  expect(() => editor.events.on("focus", () => undefined)).toThrow("destroyed");
  expect(() => editor.destroy()).not.toThrow();
});

it("rejects destruction during setup before changing editor state", () => {
  expect(() =>
    editor.extensions.register("invalid", {
      setup: () => editor.destroy(),
    }),
  ).toThrow(AggregateError);
  expect(editor.getNode("still-active").id).toBe("still-active");
  editor.extensions.register("invalid", { setup: () => undefined });
});

it("captures registration ownership when a listener fails during setup publication", () => {
  const stop = editor.renderers.subscribe(() => {
    throw new Error("observer failed");
  });
  expect(() =>
    editor.extensions.register("invalid", {
      setup: () => {
        editor.renderers.register("text", { content: () => null });
      },
    }),
  ).toThrow(AggregateError);
  expect(editor.renderers.get("text")).toBeUndefined();
  stop();
});

it("rolls back synchronous registrations when setup returns an unsupported async result", () => {
  const setup = () => {
    editor.slots.register({ position: "body", component: () => null });
    return Promise.resolve();
  };
  expect(() =>
    editor.extensions.register("async", {
      setup: setup as unknown as BlockEditorExtension["setup"],
    }),
  ).toThrow(AggregateError);
  expect(editor.slots.getSnapshot()).toEqual([]);
  editor.extensions.register("async", { setup: () => undefined });
});

it("adds data-driven behavior with explicit cleanup without destroying borrowed nodes or data", () => {
  const adapter = new TestBlockEditorAdapter();
  const instance = new BlockEditorController({ adapter });
  adapter.setNode("a");
  const changed = jest.fn();
  const node = instance.getNode("a");
  const remove = instance.extensions.register("data-observer", {
    setup: () => {
      instance.extensions.registerCleanup(node.subscribe(changed));
    },
  });
  adapter.setNode("a", { checked: true });
  expect(changed).toHaveBeenCalledTimes(1);
  remove();
  expect(adapter.subscriberCount).toBe(0);
  node.setChecked(false);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(node.getSnapshot()).toBe(adapter.nodes.get("a"));
  instance.destroy();
  expect(adapter.nodes.get("a")?.checked).toBe(false);
});
