import { createTestEditor as createRivtoEditor } from "../test-utils";

describe("EditorRuntime history manager", () => {
  it("undoes and redoes one document command at a time", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" }).id;

    editor.blocks.updateBlock(id, { content: "Updated" });

    editor.history.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Initial" }]);

    editor.history.redo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Updated" }]);
    editor.destroy();
  });

  it("keeps fast consecutive commands as separate undo steps", () => {
    const editor = createRivtoEditor();

    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" }).id;
    editor.blocks.setBlockProp(id, "tone", "info");

    editor.history.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Initial", props: {} }]);

    editor.history.undo();
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.destroy();
  });

  it("batches nested editor updates into one revision and undo step", () => {
    const editor = createRivtoEditor();
    let revisions = 0;
    const unsubscribe = editor.subscribe(() => {
      revisions += 1;
    });

    const secondId = editor.history.batchUpdates(() => {
      const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
      return editor.history.batchUpdates(() => (
        editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId)
      )).id;
    });

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([
      expect.any(String),
      secondId,
    ]);
    expect(revisions).toBe(1);

    editor.history.undo();
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.history.redo();
    expect(editor.blocks.getBlocks()).toHaveLength(2);

    unsubscribe();
    editor.destroy();
  });

  it("keeps consecutive block updates in one capture group", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" }).id;

    editor.blocks.updateBlock(id, { content: "First" });
    editor.blocks.updateBlock(id, { content: "Second" });

    editor.history.undo();

    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Initial" }]);
    editor.destroy();
  });

  it("keeps undo history across mode switches and splits typing capture", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" }).id;

    editor.blocks.updateBlock(id, { content: "First" });
    editor.mode.set("edgeless");
    editor.blocks.updateBlock(id, { content: "Second" });

    editor.history.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "First" }]);

    editor.history.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Initial" }]);
    editor.destroy();
  });

  it("excludes derived maintenance from user undo history", () => {
    const editor = createRivtoEditor();
    const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "User change" }).id;

    editor.history.batchUpdatesWithoutHistory(() => {
      editor.elements.insertElement({
        id: "derived",
        type: "block",
        frame: { x: 0, y: 0, width: 100, height: 100 },
        zIndex: 0,
        props: { startBlockId: blockId, endBlockId: blockId },
      });
    });
    editor.history.undo();

    expect(editor.blocks.getBlock(blockId)).toBeUndefined();
    expect(editor.elements.getElement("derived")).toBeDefined();
    editor.destroy();
  });

  it("publishes document updates for undo and redo", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" }).id;
    const calls: string[] = [];
    const unsubscribe = editor.subscribe(() => calls.push(editor.blocks.getBlocks()[0]?.content ?? ""));

    editor.blocks.updateBlock(id, { content: "Updated" });
    editor.history.undo();
    editor.history.redo();

    expect(calls).toEqual(["Updated", "Initial", "Updated"]);
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Updated" }]);
    unsubscribe();
    editor.destroy();
  });

  it("clears history after loading persisted state", () => {
    const editor = createRivtoEditor();

    editor.blocks.insertBlock({ type: "paragraph", content: "Before load" });
    editor.load({
      version: 6,
      blocks: [{
        id: "loaded",
        type: "paragraph",
        listProps: { collapsed: false, type: "list", checked: false },
        props: {},
        pluginData: {},
        content: "Loaded",
        children: [],
      }],
    });

    editor.history.undo();

    expect(editor.blocks.getBlocks()).toMatchObject([{ id: "loaded", content: "Loaded" }]);
    editor.destroy();
  });
});
