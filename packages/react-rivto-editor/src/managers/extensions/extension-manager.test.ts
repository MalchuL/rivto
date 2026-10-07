import { createTestReactEditor as createReactEditor } from "../../test-utils";
import { createTestCoreEditor as createEditor } from "../../test-utils";
import type { ComponentType } from "react";


const Mounted: ComponentType = () => null;

describe("ExtensionManager", () => {
  test("releases extensions when earlier runtime cleanup throws", async () => {
    const editor = await createEditor();
    let released = false;
    const reactEditor = createReactEditor({ editor, extensions: [{
      id: "cleanup",
      setup: () => () => { released = true; },
    }] });
    const root = Object.assign(new EventTarget(), { ownerDocument: { defaultView: {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
    } } }) as unknown as HTMLElement;
    reactEditor.events.getRoot = () => root;
    // A no-op stands in for selection restoration; this test exercises cancellation cleanup.
    reactEditor.selection.scheduleIfSelectionUnchanged(() => {}, () => {
      throw new Error("restoration cleanup failed");
    });
    expect(() => reactEditor.destroy()).toThrow("restoration cleanup failed");
    expect(released).toBe(true);
    expect(reactEditor.selection.hasPendingSelectionCallback).toBe(false);
    expect(() => reactEditor.extensions.mount(Mounted)).toThrow(/destroyed/);
    expect(() => reactEditor.destroy()).not.toThrow();
    editor.destroy();
  });

  test("rolls back a throwing extension and continues teardown after a cleanup error", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const released: string[] = [];
    expect(() => reactEditor.extensions.install({
      id: "failing.setup",
      setup: (reactEditor) => {
        reactEditor.extensions.mount(Mounted);
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
      setup: (reactEditor) => {
        reactEditor.extensions.mount(Mounted, "afterSurface");
      },
    });
    expect(reactEditor.extensions.getComponents("afterSurface")).toEqual([Mounted]);
    expect(() => dispose()).toThrow("cleanup failed");
    expect(reactEditor.extensions.getComponents("afterSurface")).toEqual([Mounted]);
    reactEditor.destroy();
    expect(reactEditor.extensions.getComponents()).toEqual([]);
    editor.destroy();
  });

  test("owns repeated component registrations by registration identity", async () => {
    const editor = await createEditor();
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
