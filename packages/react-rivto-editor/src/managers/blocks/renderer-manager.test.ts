import type { ComponentType } from "react";
import { createTestCoreEditor as createEditor, createTestReactEditor as createReactEditor } from "../../test-utils";

const renderer: ComponentType<{ blockId: string }> = () => null;
const fallback: ComponentType<{ blockId: string }> = () => null;

describe("RendererManager", () => {
  test("registers exact renderers and falls back without exposing mutable state", async () => {
    const editor = await createEditor();
    const panel = createReactEditor({
      editor,
      unknownBlockRenderer: fallback,
    });
    const manager = panel.editor.renderers;
    const revision = panel.editor.renderers.revision;
    const dispose = manager.register("card", renderer);

    expect(manager.get("card")).toBe(renderer);
    expect(manager.get("persisted.unknown")).toBe(fallback);
    expect(manager.has("persisted.unknown")).toBe(false);
    expect(() => manager.register("card", renderer)).toThrow(/already registered/);

    expect(manager.delete("card")).toBe(true);
    expect(manager.delete("card")).toBe(false);
    dispose();
    expect(manager.get("card")).toBe(fallback);
    expect(panel.editor.renderers.revision).toBe(revision + 2);
    panel.editor.destroy();
    editor.destroy();
  });
});
