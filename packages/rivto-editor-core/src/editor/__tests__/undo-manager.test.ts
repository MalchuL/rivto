import { createTestEditor as createRivtoEditor } from "../test-utils";

describe("EditorRuntime undo manager", () => {
  it("undoes and redoes one document command at a time", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" });

    editor.blocks.updateBlock(id, { content: "Updated" });

    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Initial" }]);

    editor.redo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Updated" }]);
    editor.destroy();
  });

  it("keeps fast consecutive commands as separate undo steps", () => {
    const editor = createRivtoEditor();

    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" });
    editor.blocks.setBlockProp(id, "tone", "info");

    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Initial", props: {} }]);

    editor.undo();
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.destroy();
  });

  it("batches nested editor updates into one revision and undo step", () => {
    const editor = createRivtoEditor();
    let revisions = 0;
    const unsubscribe = editor.subscribe(() => {
      revisions += 1;
    });

    const secondId = editor.batchUpdates(() => {
      const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
      return editor.batchUpdates(() => (
        editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId)
      ));
    });

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([
      expect.any(String),
      secondId,
    ]);
    expect(revisions).toBe(1);

    editor.undo();
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.redo();
    expect(editor.blocks.getBlocks()).toHaveLength(2);

    unsubscribe();
    editor.destroy();
  });

  it("keeps consecutive block updates in one capture group", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" });

    editor.blocks.updateBlock(id, { content: "First" });
    editor.blocks.updateBlock(id, { content: "Second" });

    editor.undo();

    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Initial" }]);
    editor.destroy();
  });

  it("keeps undo history across mode switches and splits typing capture", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" });

    editor.blocks.updateBlock(id, { content: "First" });
    editor.mode.set("edgeless");
    editor.blocks.updateBlock(id, { content: "Second" });

    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "First" }]);

    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Initial" }]);
    editor.destroy();
  });

  it("excludes derived maintenance from user undo history", () => {
    const editor = createRivtoEditor();
    const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "User change" });

    editor.batchUpdatesWithoutHistory(() => {
      editor.elements.insertElement({
        id: "derived",
        type: "block",
        frame: { x: 0, y: 0, width: 100, height: 100 },
        zIndex: 0,
        props: { startBlockId: blockId, endBlockId: blockId },
      });
    });
    editor.undo();

    expect(editor.blocks.getBlock(blockId)).toBeUndefined();
    expect(editor.elements.getElement("derived")).toBeDefined();
    editor.destroy();
  });

  it("publishes document updates for undo and redo", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" });
    const calls: string[] = [];
    const unsubscribe = editor.subscribe(() => calls.push(editor.blocks.getBlocks()[0]?.content ?? ""));

    editor.blocks.updateBlock(id, { content: "Updated" });
    editor.execute("history.undo");
    editor.execute("history.redo");

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

    editor.undo();

    expect(editor.blocks.getBlocks()).toMatchObject([{ id: "loaded", content: "Loaded" }]);
    editor.destroy();
  });
});
