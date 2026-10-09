import { createTestReactEditor as createReactEditor } from "../../test-utils";
import { createTestCoreEditor as createEditor } from "../../test-utils";
import type { ComponentType } from "react";


const renderer: ComponentType<{ blockId: string }> = () => null;
const fallback: ComponentType<{ blockId: string }> = () => null;

describe("RendererManager", () => {
  test("registers exact renderers and falls back without exposing mutable state", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({
      editor,
      unknownBlockRenderer: fallback,
    });
    const manager = editorView.renderers;
    const revision = editorView.renderers.revision;
    const dispose = manager.register("card", renderer);

    expect(manager.get("card")).toBe(renderer);
    expect(manager.get("persisted.unknown")).toBe(fallback);
    expect(manager.has("persisted.unknown")).toBe(false);
    expect(() => manager.register("card", renderer)).toThrow(/already registered/);

    expect(manager.delete("card")).toBe(true);
    expect(manager.delete("card")).toBe(false);
    dispose();
    expect(manager.get("card")).toBe(fallback);
    expect(editorView.renderers.revision).toBe(revision + 2);
    editorView.destroy();
    editor.destroy();
  });
});
