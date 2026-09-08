import { createTestCoreEditor as createEditor } from "../../test-utils";
import type { ComponentType } from "react";
import { createReactEditor } from "../../react-editor";

const Mounted: ComponentType = () => null;

describe("ExtensionManager", () => {
  test("rolls back a throwing extension and continues teardown after a cleanup error", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    const released: string[] = [];
    expect(() => reactEditor.extensions.install({
      id: "failing.setup",
      setup: (runtime) => {
        runtime.extensions.mount(Mounted);
        released.push("mounted");
        throw new Error("setup failed");
      },
    })).toThrow("setup failed");
    expect(reactEditor.extensions.getComponents()).toEqual([]);

    const dispose = reactEditor.extensions.install({
      id: "throwing.cleanup",
      setup: () => () => {
        throw new Error("cleanup failed");
      },
    });
    reactEditor.extensions.install({
      id: "later",
      setup: (runtime) => {
        runtime.extensions.mount(Mounted, "afterSurface");
      },
    });
    expect(reactEditor.extensions.getComponents("afterSurface")).toEqual([Mounted]);
    expect(() => dispose()).toThrow("cleanup failed");
    expect(reactEditor.extensions.getComponents("afterSurface")).toEqual([Mounted]);
    reactEditor.destroy();
    expect(reactEditor.extensions.getComponents()).toEqual([]);
    editor.destroy();
  });

  test("owns repeated component registrations by registration identity", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.extensions;
    const first = manager.mount(Mounted);
    manager.mount(Mounted);

    first();
    first();
    expect(manager.getComponents()).toEqual([Mounted]);

    reactEditor.destroy();
    expect(manager.getComponents()).toEqual([]);
    expect(() => manager.mount(Mounted)).toThrow(/destroyed/);
    editor.destroy();
  });
});
