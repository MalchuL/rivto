import type { ComponentType } from "react";
import {
  createTestCoreEditor as createEditor,
  createTestReactEditor as createReactEditor,
} from "../../test-utils";

const renderer: ComponentType<{ blockId: string }> = () => null;
const fallback: ComponentType<{ blockId: string }> = () => null;

describe("RendererManager", () => {
  test("removes the owned layout and preserves a replacement against stale disposal", async () => {
    const editor = await createEditor();
    const panel = createReactEditor({ editor });
    const manager = panel.editor.renderers;
    const dispose = manager.register("layout-card", renderer, fallback);
    expect(panel.page.renderers.get("layout-card")?.layout).toBe(fallback);
    manager.delete("layout-card");
    expect(panel.page.renderers.get("layout-card")?.layout).toBeUndefined();
    const replacement = manager.register("layout-card", fallback, renderer);
    dispose();
    expect(panel.page.renderers.get("layout-card")?.layout).toBe(renderer);
    replacement();
    expect(panel.page.renderers.get("layout-card")?.layout).toBeUndefined();
    panel.editor.destroy();
    editor.destroy();
  });

  test("rolls back content and layout when publication fails", async () => {
    const editor = await createEditor();
    const panel = createReactEditor({ editor });
    const manager = panel.editor.renderers;
    const unsubscribe = manager.subscribe(() => {
      throw new Error("observer failed");
    });
    expect(() => manager.register("layout-card", renderer, fallback)).toThrow(AggregateError);
    expect(manager.has("layout-card")).toBe(false);
    expect(panel.page.renderers.get("layout-card")?.layout).toBeUndefined();
    unsubscribe();
    manager.register("layout-card", renderer, fallback);
    panel.editor.destroy();
    editor.destroy();
  });

  test("registers exact renderers and falls back without exposing mutable state", async () => {
    const editor = await createEditor();
    const reactPanel = createReactEditor({
      editor,
      unknownBlockRenderer: fallback,
    });
    const manager = reactPanel.editor.renderers;
    const revision = reactPanel.editor.renderers.revision;
    const dispose = manager.register("card", renderer);

    expect(manager.get("card")).toBe(renderer);
    expect(manager.get("persisted.unknown")).toBe(fallback);
    expect(manager.has("persisted.unknown")).toBe(false);
    expect(() => manager.register("card", renderer)).toThrow(/already registered/);

    expect(manager.delete("card")).toBe(true);
    expect(manager.delete("card")).toBe(false);
    dispose();
    expect(manager.get("card")).toBe(fallback);
    expect(reactPanel.editor.renderers.revision).toBe(revision + 2);
    reactPanel.editor.destroy();
    editor.destroy();
  });
});
