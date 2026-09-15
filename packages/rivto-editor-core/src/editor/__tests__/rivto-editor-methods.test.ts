import { createTestEditor as createRivtoEditor } from "../test-utils";
import { YjsDoc } from "@chulane/crdt-doc";

describe("EditorRuntime methods", () => {
  it("supports a complete lifecycle without blocks", () => {
    const editor = createRivtoEditor();

    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.blocks.getRootIds()).toEqual([]);
    expect(editor.selection.get()).toBeUndefined();
    expect(editor.dump()).toMatchObject({ version: 6, blocks: [] });

    editor.deleteSelection();
    editor.undo();
    editor.redo();
    expect(editor.blocks.getBlocks()).toEqual([]);

    const id = editor.batchUpdates(() => editor.blocks.insertBlock({ type: "paragraph", content: "Created later" }));
    editor.blocks.removeBlock(id);
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.undo();
    expect(editor.blocks.getBlock(id)?.content).toBe("Created later");
    editor.redo();
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.destroy();
  });

  it("destroys the CRDT document owned by the runtime", async () => {
    const document = new YjsDoc("editor-lifecycle");
    const destroy = jest.spyOn(document, "destroy");
    const editor = createRivtoEditor({ document });

    await editor.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("mutates blocks through editor methods", () => {
    const editor = createRivtoEditor();

    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);

    editor.blocks.updateBlock(firstId, { content: "First updated" });
    editor.blocks.setBlockProp(firstId, "tone", "info");
    editor.blocks.setBlockPluginData(firstId, "test", { seen: true });
    editor.blocks.indentBlock(secondId);

    expect(editor.blocks.getBlocks()).toMatchObject([
      {
        id: firstId,
        content: "First updated",
        props: { tone: "info" },
        pluginData: { test: { seen: true } },
        children: [{ id: secondId, content: "Second" }],
      },
    ]);

    editor.blocks.outdentBlock(secondId);
    editor.blocks.moveBlock(secondId, null);

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([secondId, firstId]);

    editor.blocks.removeBlock(secondId);

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([firstId]);
    editor.destroy();
  });

  it("loads and dumps snapshots through editor methods", () => {
    const editor = createRivtoEditor();

    editor.load({
      version: 6,
      blocks: [{
        id: "loaded",
        type: "paragraph",
        listProps: { collapsed: false, type: "list", checked: false },
        props: { tone: "success" },
        pluginData: {},
        content: "Loaded",
        children: [],
      }],
      pluginData: { app: { theme: "dark" } },
    });

    expect(editor.dump()).toMatchObject({
      version: 6,
      blocks: [{
        id: "loaded",
        content: "Loaded",
        listProps: { type: "list", checked: false },
        props: { tone: "success" },
      }],
      pluginData: { app: { theme: "dark" } },
    });

    editor.load({ version: 6, blocks: [] });
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.dump()).toMatchObject({ version: 6, blocks: [] });
    editor.destroy();
  });
});
