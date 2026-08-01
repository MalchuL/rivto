import { createRivtoEditor } from "../rivto-editor";

describe("EditorRuntime methods", () => {
  it("supports a complete lifecycle without blocks", () => {
    const editor = createRivtoEditor();

    expect(editor.getBlocks()).toEqual([]);
    expect(editor.getRootIds()).toEqual([]);
    expect(editor.getVisibleBlockIds()).toEqual([]);
    expect(editor.getLinks()).toEqual([]);
    expect(editor.selection.get()).toEqual([]);
    expect(editor.dump()).toMatchObject({ version: 4, blocks: [], links: [] });

    editor.deleteSelection();
    editor.undo();
    editor.redo();
    expect(editor.getBlocks()).toEqual([]);

    const id = editor.batchUpdates(() => editor.insertBlock({ type: "paragraph", content: "Created later" }));
    editor.removeBlock(id);
    expect(editor.getBlocks()).toEqual([]);
    editor.undo();
    expect(editor.getBlock(id)?.content).toBe("Created later");
    editor.redo();
    expect(editor.getBlocks()).toEqual([]);
    editor.destroy();
  });

  it("mutates blocks through editor methods", () => {
    const editor = createRivtoEditor();

    const firstId = editor.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);

    editor.updateBlock(firstId, { content: "First updated" });
    editor.setBlockProp(firstId, "tone", "info");
    editor.setBlockPluginData(firstId, "test", { seen: true });
    editor.setBlockLayout(firstId, { x: 120, y: 80 });
    editor.indentBlock(secondId);

    expect(editor.getBlocks()).toMatchObject([
      {
        id: firstId,
        content: "First updated",
        props: { tone: "info" },
        pluginData: { test: { seen: true } },
        layout: { x: 120, y: 80 },
        children: [{ id: secondId, content: "Second" }],
      },
    ]);

    editor.outdentBlock(secondId);
    editor.moveBlock(secondId, null);

    expect(editor.getBlocks().map((block) => block.id)).toEqual([secondId, firstId]);

    editor.removeBlock(secondId);

    expect(editor.getBlocks().map((block) => block.id)).toEqual([firstId]);
    editor.destroy();
  });

  it("mutates links through editor methods", () => {
    const editor = createRivtoEditor();
    const sourceId = editor.insertBlock({ type: "paragraph" });
    const targetId = editor.insertBlock({ type: "paragraph" }, sourceId);

    editor.createLink({
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

    editor.removeLink("source-target");

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
    expect(editor.getBlocks()).toEqual([]);
    expect(editor.dump()).toMatchObject({ version: 4, blocks: [], links: [] });
    editor.destroy();
  });
});
