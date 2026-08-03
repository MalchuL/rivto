import { createRivtoEditor } from "../rivto-editor";

describe("EditorRuntime methods", () => {
  it("supports a complete lifecycle without blocks", () => {
    const editor = createRivtoEditor();

    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.blocks.getRootIds()).toEqual([]);
    expect(editor.blocks.getVisibleBlockIds()).toEqual([]);
    expect(editor.links.getLinks()).toEqual([]);
    expect(editor.selection.get()).toEqual([]);
    expect(editor.dump()).toMatchObject({ version: 4, blocks: [], links: [] });

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

  it("mutates blocks through editor methods", () => {
    const editor = createRivtoEditor();

    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);

    editor.blocks.updateBlock(firstId, { content: "First updated" });
    editor.blocks.setBlockProp(firstId, "tone", "info");
    editor.blocks.setBlockPluginData(firstId, "test", { seen: true });
    editor.blocks.setBlockLayout(firstId, { x: 120, y: 80 });
    editor.blocks.indentBlock(secondId);

    expect(editor.blocks.getBlocks()).toMatchObject([
      {
        id: firstId,
        content: "First updated",
        props: { tone: "info" },
        pluginData: { test: { seen: true } },
        layout: { x: 120, y: 80 },
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

  it("mutates links through editor methods", () => {
    const editor = createRivtoEditor();
    const sourceId = editor.blocks.insertBlock({ type: "paragraph" });
    const targetId = editor.blocks.insertBlock({ type: "paragraph" }, sourceId);

    editor.links.createLink({
      id: "source-target",
      from: { blockId: sourceId },
      to: { blockId: targetId },
      meta: { label: "related" },
    });

    expect(editor.dump().links).toEqual([
      {
        id: "source-target",
        from: { blockId: sourceId },
        to: { blockId: targetId },
        meta: { label: "related" },
      },
    ]);

    editor.links.removeLink("source-target");

    expect(editor.dump().links).toEqual([]);
    editor.destroy();
  });

  it("loads and dumps snapshots through editor methods", () => {
    const editor = createRivtoEditor();

    editor.load({
      version: 4,
      blocks: [{
        id: "loaded",
        type: "paragraph",
        collapsed: false,
        props: { tone: "success" },
        pluginData: {},
        content: "Loaded",
        children: [],
      }],
      links: [],
      pluginData: { app: { theme: "dark" } },
    });

    expect(editor.dump()).toMatchObject({
      version: 4,
      blocks: [{ id: "loaded", content: "Loaded", props: { tone: "success" } }],
      links: [],
      pluginData: { app: { theme: "dark" } },
    });

    editor.load({ version: 4, blocks: [], links: [] });
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.dump()).toMatchObject({ version: 4, blocks: [], links: [] });
    editor.destroy();
  });
});
