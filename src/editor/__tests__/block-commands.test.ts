import { createRivtoEditor } from "../rivto-editor";

describe("EditorRuntime block commands", () => {
  const expectOneUpdate = (editor: ReturnType<typeof createRivtoEditor>, action: () => void): void => {
    const calls: number[] = [];
    const unsubscribe = editor.subscribe(() => calls.push(editor.revision));
    const before = editor.revision;

    action();

    expect(calls).toHaveLength(1);
    expect(editor.revision).toBe(before + 1);
    expect(calls[0]).toBe(editor.revision);
    unsubscribe();
  };

  it("mutates blocks through registered commands", () => {
    const editor = createRivtoEditor();

    const firstId = editor.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);

    editor.setBlockProp(firstId, "tone", "info");
    editor.setBlockLayout(firstId, { x: 120, y: 80 });
    editor.indentBlock(secondId);

    expect(editor.document.document).toMatchObject([
      {
        id: firstId,
        props: { tone: "info" },
        layout: { x: 120, y: 80 },
        children: [{ id: secondId, content: "Second" }],
      },
    ]);

    editor.removeBlock(firstId);

    expect(editor.document.document).toEqual([]);
    editor.destroy();
  });

  it("registers and removes runtime commands through the editor api", () => {
    const editor = createRivtoEditor();

    editor.register("test.echo", (payload) => payload);

    expect(editor.execute("test.echo", "ok")).toBe("ok");

    editor.removeCommand("test.echo");

    expect(() => editor.execute("test.echo")).toThrow("Unknown command test.echo");
    editor.destroy();
  });

  it("converts a block without losing identity or nested data", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({
      type: "paragraph",
      props: { old: true },
      pluginData: { demo: { pinned: true } },
      content: "Title",
      children: [{ type: "paragraph", content: "Child" }],
      layout: { x: 90 },
    });

    editor.setBlockType(id, "heading2");

    expect(editor.getBlock(id)).toMatchObject({
      id,
      type: "heading2",
      props: {},
      pluginData: { demo: { pinned: true } },
      content: "Title",
      children: [{ content: "Child" }],
      layout: { x: 90 },
    });
    editor.undo();
    expect(editor.getBlock(id)).toMatchObject({ type: "paragraph", props: { old: true } });
    expect(() => editor.setBlockType(id, "missing")).toThrow("Unknown block type missing");
    editor.destroy();
  });

  it("notifies subscribers once for every successful block command", () => {
    const editor = createRivtoEditor();
    let firstId = "";
    let secondId = "";

    expectOneUpdate(editor, () => {
      firstId = editor.insertBlock({ type: "paragraph", content: "First" });
    });
    expectOneUpdate(editor, () => {
      secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    });
    expectOneUpdate(editor, () => {
      editor.updateBlock(firstId, { content: "First updated" });
    });
    expectOneUpdate(editor, () => {
      editor.setBlockProp(firstId, "tone", "info");
    });
    expectOneUpdate(editor, () => {
      editor.setBlockPluginData(firstId, "test", { seen: true });
    });
    expectOneUpdate(editor, () => {
      editor.setBlockLayout(firstId, { x: 20 });
    });
    expectOneUpdate(editor, () => {
      editor.indentBlock(secondId);
    });
    expectOneUpdate(editor, () => {
      editor.outdentBlock(secondId);
    });
    expectOneUpdate(editor, () => {
      editor.moveBlock(secondId, null);
    });
    expectOneUpdate(editor, () => {
      editor.removeBlock(secondId);
    });

    editor.destroy();
  });

  it("outdents once and adopts every following sibling after existing children", () => {
    const editor = createRivtoEditor();
    const parentId = editor.insertBlock({ type: "paragraph", content: "Parent" });
    const beforeId = editor.insertBlock({ type: "paragraph", content: "Before" }, parentId);
    editor.indentBlock(beforeId);
    const currentId = editor.insertBlock({ type: "paragraph", content: "Current" }, beforeId);
    const existingChildId = editor.insertBlock({ type: "paragraph", content: "Existing child" }, currentId);
    editor.indentBlock(existingChildId);
    const followingId = editor.insertBlock({ type: "paragraph", content: "Following" }, currentId);
    const lastId = editor.insertBlock({ type: "paragraph", content: "Last" }, followingId);

    expectOneUpdate(editor, () => editor.outdentBlock(currentId));

    expect(editor.getBlocks()).toMatchObject([
      { id: parentId, children: [{ id: beforeId }] },
      {
        id: currentId,
        children: [
          { id: existingChildId },
          { id: followingId },
          { id: lastId },
        ],
      },
    ]);

    editor.undo();
    expect(editor.getBlocks()).toMatchObject([{
      id: parentId,
      children: [
        { id: beforeId },
        { id: currentId, children: [{ id: existingChildId }] },
        { id: followingId },
        { id: lastId },
      ],
    }]);
    editor.destroy();
  });

  it("merges text and descendants in one undoable update", () => {
    const editor = createRivtoEditor();
    const targetId = editor.insertBlock({ type: "paragraph", content: "Before" });
    const targetChildId = editor.insertBlock({ type: "paragraph", content: "Target child" }, targetId);
    editor.indentBlock(targetChildId);
    const sourceId = editor.insertBlock({ type: "paragraph", content: "After" }, targetId);
    const sourceChildId = editor.insertBlock({ type: "paragraph", content: "Source child" }, sourceId);
    editor.indentBlock(sourceChildId);
    let joinOffset = -1;

    expectOneUpdate(editor, () => {
      joinOffset = editor.mergeBlocks(targetId, sourceId);
    });

    expect(joinOffset).toBe("Before".length);
    expect(editor.getBlocks()).toMatchObject([{
      id: targetId,
      content: "BeforeAfter",
      children: [{ id: targetChildId }, { id: sourceChildId }],
    }]);
    expect(editor.getBlock(sourceId)).toBeUndefined();

    editor.undo();
    expect(editor.getBlocks()).toMatchObject([
      { id: targetId, content: "Before", children: [{ id: targetChildId }] },
      { id: sourceId, content: "After", children: [{ id: sourceChildId }] },
    ]);
    editor.destroy();
  });

  it("stops notifying after unsubscribe", () => {
    const editor = createRivtoEditor();
    const listener = jest.fn();
    const unsubscribe = editor.subscribe(listener);

    unsubscribe();
    editor.insertBlock({ type: "paragraph" });

    expect(listener).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("does not notify when a command fails", () => {
    const editor = createRivtoEditor();
    const listener = jest.fn();
    editor.subscribe(listener);
    const before = editor.revision;

    expect(() => editor.execute("block.insert", { block: { type: "missing" } })).toThrow("unavailable");

    expect(listener).not.toHaveBeenCalled();
    expect(editor.revision).toBe(before);
    editor.destroy();
  });

  it("creates links and loads/dumps snapshots through editor methods", () => {
    const editor = createRivtoEditor();
    const sourceId = editor.insertBlock({ type: "paragraph", content: "Source" });
    const targetId = editor.insertBlock({ type: "paragraph", content: "Target" }, sourceId);

    editor.createLink({ id: "source-target", from: { blockId: sourceId }, to: { blockId: targetId } });

    expect(editor.dump()).toMatchObject({
      version: 3,
      blocks: [{ id: sourceId }, { id: targetId }],
      links: [{ id: "source-target", from: { blockId: sourceId }, to: { blockId: targetId } }],
    });

    editor.removeLink("source-target");
    expect(editor.dump().links).toEqual([]);

    editor.load({
      version: 3,
      blocks: [{
        id: "loaded",
        type: "paragraph",
        props: {},
        pluginData: {},
        content: "Loaded",
        children: [],
      }],
      links: [],
    });

    expect(editor.document.document).toMatchObject([{ id: "loaded", content: "Loaded" }]);
    editor.destroy();
  });
});
