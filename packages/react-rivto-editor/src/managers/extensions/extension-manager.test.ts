import type { ComponentType } from "react";
import { createTestCoreEditor as createEditor, createTestReactEditor as createReactEditor } from "../../test-utils";

const Mounted: ComponentType = () => null;

describe("ExtensionManager", () => {
  test("releases extensions when earlier runtime cleanup throws", async () => {
    const editor = await createEditor();
    let released = false;
    const reactPanel = createReactEditor({ editor, extensions: [{
      id: "cleanup",
      setup: () => () => { released = true; },
    }] });
    const root = Object.assign(new EventTarget(), { ownerDocument: { defaultView: {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
    } } }) as unknown as HTMLElement;
    reactPanel.events.getRoot = () => root;
    // A no-op stands in for selection restoration; this test exercises cancellation cleanup.
    reactPanel.selection.scheduleIfSelectionUnchanged(() => {}, () => {
      throw new Error("restoration cleanup failed");
    });
    expect(() => reactPanel.editor.destroy()).toThrow("restoration cleanup failed");
    expect(released).toBe(true);
    expect(reactPanel.selection.hasPendingSelectionCallback).toBe(false);
    expect(() => reactPanel.editor.extensions.mount(Mounted)).toThrow(/destroyed/);
    expect(() => reactPanel.editor.destroy()).not.toThrow();
    editor.destroy();
  });

  test("rolls back a throwing extension and continues teardown after a cleanup error", async () => {
    const editor = await createEditor();
    const reactPanel = createReactEditor({ editor });
    const released: string[] = [];
    expect(() => reactPanel.editor.extensions.install({
      id: "failing.setup",
      setup: (reactEditor) => {
        reactEditor.extensions.mount(Mounted);
        released.push("mounted");
        throw new Error("setup failed");
      },
    })).toThrow("setup failed");
    expect(reactPanel.editor.extensions.getComponents()).toEqual([]);

    const dispose = reactPanel.editor.extensions.install({
      id: "throwing.cleanup",
      setup: () => () => {
        throw new Error("cleanup failed");
      },
    });
    reactPanel.editor.extensions.install({
      id: "later",
      setup: (reactEditor) => {
        reactEditor.extensions.mount(Mounted, "afterSurface");
      },
    });
    expect(reactPanel.editor.extensions.getComponents("afterSurface")).toEqual([Mounted]);
    expect(() => dispose()).toThrow("cleanup failed");
    expect(reactPanel.editor.extensions.getComponents("afterSurface")).toEqual([Mounted]);
    reactPanel.editor.destroy();
    expect(reactPanel.editor.extensions.getComponents()).toEqual([]);
    editor.destroy();
  });

  test("owns repeated component registrations by registration identity", async () => {
    const editor = await createEditor();
    const reactPanel = createReactEditor({ editor });
    const manager = reactPanel.editor.extensions;
    const first = manager.mount(Mounted);
    manager.mount(Mounted);

    first();
    first();
    expect(manager.getComponents()).toEqual([Mounted]);

    reactPanel.editor.destroy();
    expect(manager.getComponents()).toEqual([]);
    expect(() => manager.mount(Mounted)).toThrow(/destroyed/);
    editor.destroy();
  });
});
