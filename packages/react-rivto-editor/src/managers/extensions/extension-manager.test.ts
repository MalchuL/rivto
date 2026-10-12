import type { ComponentType } from "react";
import { createTestCoreEditor as createEditor, createTestReactEditor as createReactEditor } from "../../test-utils";

const Mounted: ComponentType = () => null;

describe("ExtensionManager", () => {
  test("releases extensions when earlier runtime cleanup throws", async () => {
    const editor = await createEditor();
    let released = false;
    const panel = createReactEditor({ editor, extensions: [{
      id: "cleanup",
      setup: () => () => { released = true; },
    }] });
    const root = Object.assign(new EventTarget(), { ownerDocument: { defaultView: {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
    } } }) as unknown as HTMLElement;
    panel.events.getRoot = () => root;
    // A no-op stands in for selection restoration; this test exercises cancellation cleanup.
    panel.selection.scheduleIfSelectionUnchanged(() => {}, () => {
      throw new Error("restoration cleanup failed");
    });
    expect(() => panel.editor.destroy()).toThrow("restoration cleanup failed");
    expect(released).toBe(true);
    expect(panel.selection.hasPendingSelectionCallback).toBe(false);
    expect(() => panel.editor.extensions.mount(Mounted)).toThrow(/destroyed/);
    expect(() => panel.editor.destroy()).not.toThrow();
    editor.destroy();
  });

  test("rolls back a throwing extension and continues teardown after a cleanup error", async () => {
    const editor = await createEditor();
    const panel = createReactEditor({ editor });
    const released: string[] = [];
    expect(() => panel.editor.extensions.install({
      id: "failing.setup",
      setup: (reactEditor) => {
        reactEditor.extensions.mount(Mounted);
        released.push("mounted");
        throw new Error("setup failed");
      },
    })).toThrow("setup failed");
    expect(panel.editor.extensions.getComponents()).toEqual([]);

    const dispose = panel.editor.extensions.install({
      id: "throwing.cleanup",
      setup: () => () => {
        throw new Error("cleanup failed");
      },
    });
    panel.editor.extensions.install({
      id: "later",
      setup: (reactEditor) => {
        reactEditor.extensions.mount(Mounted, "afterSurface");
      },
    });
    expect(panel.editor.extensions.getComponents("afterSurface")).toEqual([Mounted]);
    expect(() => dispose()).toThrow("cleanup failed");
    expect(panel.editor.extensions.getComponents("afterSurface")).toEqual([Mounted]);
    panel.editor.destroy();
    expect(panel.editor.extensions.getComponents()).toEqual([]);
    editor.destroy();
  });

  test("owns repeated component registrations by registration identity", async () => {
    const editor = await createEditor();
    const panel = createReactEditor({ editor });
    const manager = panel.editor.extensions;
    const first = manager.mount(Mounted);
    manager.mount(Mounted);

    first();
    first();
    expect(manager.getComponents()).toEqual([Mounted]);

    panel.editor.destroy();
    expect(manager.getComponents()).toEqual([]);
    expect(() => manager.mount(Mounted)).toThrow(/destroyed/);
    editor.destroy();
  });
});
