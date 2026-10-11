import type { ComponentType } from "react";
import { createTestCoreEditor as createEditor, createTestReactEditor as createReactEditor } from "../../test-utils";


const Mounted: ComponentType = () => null;

describe("ExtensionManager", () => {
  test("releases extensions when earlier runtime cleanup throws", async () => {
    const editor = await createEditor();
    let released = false;
    const editorView = createReactEditor({ editor, extensions: [{
      id: "cleanup",
      setup: () => () => { released = true; },
    }] });
    const root = Object.assign(new EventTarget(), { ownerDocument: { defaultView: {
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => {},
    } } }) as unknown as HTMLElement;
    editorView.events.getRoot = () => root;
    // A no-op stands in for selection restoration; this test exercises cancellation cleanup.
    editorView.selection.scheduleIfSelectionUnchanged(() => {}, () => {
      throw new Error("restoration cleanup failed");
    });
    expect(() => editorView.runtime.destroy()).toThrow("restoration cleanup failed");
    expect(released).toBe(true);
    expect(editorView.selection.hasPendingSelectionCallback).toBe(false);
    expect(() => editorView.runtime.extensions.mount(Mounted)).toThrow(/destroyed/);
    expect(() => editorView.runtime.destroy()).not.toThrow();
    editor.destroy();
  });

  test("rolls back a throwing extension and continues teardown after a cleanup error", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    const released: string[] = [];
    expect(() => editorView.runtime.extensions.install({
      id: "failing.setup",
      setup: (editorRuntime) => {
        editorRuntime.extensions.mount(Mounted);
        released.push("mounted");
        throw new Error("setup failed");
      },
    })).toThrow("setup failed");
    expect(editorView.runtime.extensions.getComponents()).toEqual([]);

    const dispose = editorView.runtime.extensions.install({
      id: "throwing.cleanup",
      setup: () => () => {
        throw new Error("cleanup failed");
      },
    });
    editorView.runtime.extensions.install({
      id: "later",
      setup: (editorRuntime) => {
        editorRuntime.extensions.mount(Mounted, "afterSurface");
      },
    });
    expect(editorView.runtime.extensions.getComponents("afterSurface")).toEqual([Mounted]);
    expect(() => dispose()).toThrow("cleanup failed");
    expect(editorView.runtime.extensions.getComponents("afterSurface")).toEqual([Mounted]);
    editorView.runtime.destroy();
    expect(editorView.runtime.extensions.getComponents()).toEqual([]);
    editor.destroy();
  });

  test("owns repeated component registrations by registration identity", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    const manager = editorView.runtime.extensions;
    const first = manager.mount(Mounted);
    manager.mount(Mounted);

    first();
    first();
    expect(manager.getComponents()).toEqual([Mounted]);

    editorView.runtime.destroy();
    expect(manager.getComponents()).toEqual([]);
    expect(() => manager.mount(Mounted)).toThrow(/destroyed/);
    editor.destroy();
  });
});
