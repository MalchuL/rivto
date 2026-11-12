import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import type { ReactEditorExtension } from "./types";

interface ExampleFields {
  readonly name: string;
  /**
   * Adds a value to the example extension.
   *
   * @param value - Value supplied by another extension.
   * @returns The value has been recorded.
   */
  add(value: string): void;
}

interface ExampleExtension extends ReactEditorExtension<ExampleFields> {
  readonly id: "test.example";
  readonly fields: ExampleFields;
}

declare module "./types" {
  interface InstalledExtensions {
    "test.example": ExampleExtension;
  }
}

test("exposes the exact installed extension, its fields, and its methods", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const manager = panel.editor.extensions;
  const values: string[] = [];
  const observed: Array<string | undefined> = [];
  const unsubscribe = manager.subscribeExtension("test.example", () => {
    observed.push(manager.getExtension("test.example")?.fields.name);
  });
  const extension: ExampleExtension = {
    id: "test.example",
    fields: {
      name: "example",
      add: (value) => {
        values.push(value);
      },
    },
    setup: () => {
      expect(manager.getExtension("test.example")).toBeUndefined();
    },
  };
  const remove = manager.install(extension);
  expect(manager.getExtension("test.example")).toBe(extension);
  const removeConsumer = manager.install({
    id: "consumer",
    setup: (editor) => {
      editor.extensions.getExtension("test.example")?.fields.add("from another extension");
    },
  });
  expect(values).toEqual(["from another extension"]);
  removeConsumer();
  remove();
  expect(manager.getExtension("test.example")).toBeUndefined();
  const removeAgain = manager.install(extension);
  remove();
  expect(manager.getExtension("test.example")).toBe(extension);
  removeAgain();
  expect(observed).toEqual(["example", undefined, "example", undefined]);
  unsubscribe();
  await panel.editor.destroy();
  await core.destroy();
});

test("does not publish an extension when setup fails", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const manager = panel.editor.extensions;
  let calls = 0;
  manager.subscribeExtension("test.example", () => {
    calls += 1;
  });
  expect(() =>
    manager.install({
      id: "test.example",
      setup: () => {
        throw new Error("failed");
      },
    }),
  ).toThrow("failed");
  expect(manager.getExtension("test.example")).toBeUndefined();
  expect(calls).toBe(0);
  await panel.editor.destroy();
  await core.destroy();
});

test("keeps installations editor-local and releases the consumer subscription", async () => {
  const firstCore = await createTestCoreEditor();
  const secondCore = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: firstCore });
  const second = createTestReactEditor({ editor: secondCore });
  let calls = 0;
  const removeConsumer = first.editor.extensions.install({
    id: "consumer",
    setup: (editor) => {
      editor.extensions.subscribeExtension("test.example", () => {
        calls += 1;
      });
    },
  });
  const extension: ExampleExtension = {
    id: "test.example",
    fields: { name: "first", add: () => {} },
    setup: () => {},
  };
  const removeProvider = first.editor.extensions.install(extension);
  expect(second.editor.extensions.getExtension("test.example")).toBeUndefined();
  expect(calls).toBe(1);
  removeConsumer();
  removeProvider();
  expect(calls).toBe(1);
  await first.editor.destroy();
  await second.editor.destroy();
  await firstCore.destroy();
  await secondCore.destroy();
});

test("rolls back an installation when an observer fails", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const manager = panel.editor.extensions;
  let cleanups = 0;
  let calls = 0;
  const unsubscribe = manager.subscribeExtension("test.example", () => {
    if (manager.getExtension("test.example")) {
      throw new Error("observer failed");
    }
  });
  manager.subscribeExtension("test.example", () => {
    calls += 1;
  });
  expect(() =>
    manager.install({
      id: "test.example",
      setup: () => () => {
        cleanups += 1;
      },
    }),
  ).toThrow("observer failed");
  expect(cleanups).toBe(1);
  expect(calls).toBe(2);
  expect(manager.getExtension("test.example")).toBeUndefined();
  unsubscribe();
  await panel.editor.destroy();
  await core.destroy();
});

test("notifies consumers before provider cleanup", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const manager = panel.editor.extensions;
  const events: string[] = [];
  manager.subscribeExtension("test.example", () => {
    events.push(manager.getExtension("test.example") ? "attach" : "detach");
  });
  const remove = manager.install({
    id: "test.example",
    setup: () => () => {
      events.push("provider cleanup");
    },
  });
  remove();
  expect(events).toEqual(["attach", "detach", "provider cleanup"]);
  await panel.editor.destroy();
  await core.destroy();
});
