import { createRivtoEditor } from "../rivto-editor";

const textSelection = (blockId: string, anchor = 0, head = anchor) => ({
  type: "text" as const,
  anchor: { blockId, offset: anchor },
  head: { blockId, offset: head },
});

describe("EditorRuntime selection", () => {
  it("exposes validated manager operations and subscription cleanup", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "Text" });
    const listener = jest.fn();
    const unsubscribe = editor.selection.subscribe(listener);
    const selection = [textSelection(id, 1, 3)];

    editor.selection.set(selection);
    expect(editor.selection.get()).toEqual(selection);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => editor.selection.set([textSelection(id, 99)])).toThrow("outside block");

    editor.selection.clear();
    expect(editor.selection.get()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    editor.selection.set(selection);
    expect(listener).toHaveBeenCalledTimes(2);
    editor.destroy();
  });

  it("validates text, block, and edgeless selections", () => {
    const editor = createRivtoEditor();
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);

    editor.execute("selection.set", { selection: [textSelection(firstId, 1, 4)] });
    expect(editor.selection.get()).toEqual([textSelection(firstId, 1, 4)]);

    editor.execute("selection.set", {
      selection: [{ type: "block", blockIds: [secondId, firstId, secondId], anchorBlockId: secondId, focusBlockId: firstId }],
    });
    expect(editor.selection.get()).toEqual([{
      type: "block",
      blockIds: [firstId, secondId],
      anchorBlockId: secondId,
      focusBlockId: firstId,
    }]);

    expect(() => editor.execute("selection.set", {
      selection: [{ type: "text", anchor: { blockId: firstId, offset: 99 }, head: { blockId: firstId, offset: 99 } }],
    })).toThrow("outside block");
    expect(() => editor.execute("selection.set", {
      selection: [{ type: "edgeless", blockIds: [firstId] }],
    })).toThrow("requires edgeless");

    editor.mode.set("edgeless");
    editor.execute("selection.set", { selection: [{ type: "edgeless", blockIds: [firstId] }] });
    expect(editor.selection.get()).toEqual([{ type: "edgeless", blockIds: [firstId] }]);
    editor.destroy();
  });

  it("notifies runtime subscribers when selection changes", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "Text" });
    const listener = jest.fn();
    const unsubscribe = editor.subscribe(listener);

    editor.execute("selection.set", { selection: [textSelection(id, 0, 2)] });
    editor.execute("selection.clear");

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    editor.destroy();
  });

  it("normalizes directed and heterogeneous selections in document order", () => {
    const editor = createRivtoEditor();
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" });
    const middleId = editor.insertBlock({ type: "paragraph", content: "Middle" }, firstId);
    const lastId = editor.insertBlock({ type: "paragraph", content: "Last" }, middleId);
    editor.selection.set([
      {
        type: "text",
        anchor: { blockId: lastId, offset: 3 },
        head: { blockId: firstId, offset: 1 },
      },
      {
        type: "block",
        blockIds: [middleId],
        anchorBlockId: middleId,
        focusBlockId: middleId,
      },
    ]);

    expect(editor.selection.normalize()).toMatchObject({
      start: { blockId: firstId, offset: 1 },
      end: { blockId: lastId, offset: 3 },
      blocks: [{ id: firstId }, { id: middleId }, { id: lastId }],
    });
    editor.destroy();
  });

  it("deletes directly through the manager as one undoable transaction", () => {
    const editor = createRivtoEditor();
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    editor.selection.set([{
      type: "block",
      blockIds: [firstId, secondId],
      anchorBlockId: firstId,
      focusBlockId: secondId,
    }]);
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.selection.delete();

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.getBlocks()).toMatchObject([{ type: "paragraph", content: "" }]);
    editor.undo();
    expect(editor.getBlocks()).toMatchObject([
      { id: firstId, content: "First" },
      { id: secondId, content: "Second" },
    ]);
    unsubscribe();
    editor.destroy();
  });

  it("clears invalid selection after document or mode changes", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph" });

    editor.execute("selection.set", { selection: [{ type: "block", blockIds: [id], anchorBlockId: id, focusBlockId: id }] });
    editor.removeBlock(id);

    expect(editor.selection.get()).toEqual([]);

    const nextId = editor.insertBlock({ type: "paragraph" });
    editor.mode.set("edgeless");
    editor.execute("selection.set", { selection: [{ type: "edgeless", blockIds: [nextId] }] });
    editor.mode.set("block");

    expect(editor.selection.get()).toEqual([]);
    editor.destroy();
  });

  it("clamps text offsets when undo restores shorter content", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "A" });
    editor.updateBlock(id, { content: "Long" });
    editor.execute("selection.set", { selection: [textSelection(id, 4)] });

    editor.undo();

    expect(editor.getBlock(id)?.content).toBe("A");
    expect(editor.selection.get()).toEqual([textSelection(id, 1)]);
    editor.destroy();
  });

  it("keeps surviving IDs and direction when history removes selected blocks", () => {
    const editor = createRivtoEditor();
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    const thirdId = editor.insertBlock({ type: "paragraph", content: "Third" }, secondId);
    editor.execute("selection.set", {
      selection: [{
        type: "block",
        blockIds: [firstId, secondId, thirdId],
        anchorBlockId: thirdId,
        focusBlockId: firstId,
      }],
    });

    editor.undo();

    expect(editor.selection.get()).toEqual([{
      type: "block",
      blockIds: [firstId, secondId],
      anchorBlockId: secondId,
      focusBlockId: firstId,
    }]);
    editor.destroy();
  });

  it("filters deleted IDs from an edgeless selection", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const firstId = editor.insertBlock({ type: "paragraph" });
    const secondId = editor.insertBlock({ type: "paragraph" }, firstId);
    editor.execute("selection.set", {
      selection: [{ type: "edgeless", blockIds: [firstId, secondId] }],
    });

    editor.removeBlock(secondId);

    expect(editor.selection.get()).toEqual([{ type: "edgeless", blockIds: [firstId] }]);
    editor.destroy();
  });

  it("applies selected block commands and preserves bottom-to-top outdent order", () => {
    const editor = createRivtoEditor();
    const parentId = editor.insertBlock({ type: "paragraph", content: "Parent" });
    const firstChildId = editor.insertBlock({ type: "paragraph", content: "First child" }, parentId);
    const secondChildId = editor.insertBlock({ type: "paragraph", content: "Second child" }, firstChildId);

    editor.indentBlock(firstChildId);
    editor.indentBlock(secondChildId);
    expect(editor.getBlocks()).toMatchObject([{ id: parentId, children: [{ id: firstChildId }, { id: secondChildId }] }]);

    editor.execute("selection.set", {
      selection: [{
        type: "block",
        blockIds: [firstChildId, secondChildId],
        anchorBlockId: secondChildId,
        focusBlockId: firstChildId,
      }],
    });
    editor.outdentBlock(firstChildId);

    expect(editor.getBlocks().map((block) => block.id)).toEqual([parentId, firstChildId, secondChildId]);
    expect(editor.selection.get()).toEqual([{
      type: "block",
      blockIds: [firstChildId, secondChildId],
      anchorBlockId: secondChildId,
      focusBlockId: firstChildId,
    }]);
    editor.destroy();
  });

  it("uses a cross-block text selection as one structural Tab range", () => {
    const editor = createRivtoEditor();
    const previousId = editor.insertBlock({ type: "paragraph", content: "Previous" });
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" }, previousId);
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    const selection = [{
      type: "text" as const,
      anchor: { blockId: firstId, offset: 1 },
      head: { blockId: secondId, offset: 3 },
    }];
    editor.execute("selection.set", { selection });

    editor.indentBlock(firstId);

    expect(editor.getBlocks()).toMatchObject([{
      id: previousId,
      children: [{ id: firstId }, { id: secondId }],
    }]);
    expect(editor.selection.get()).toEqual(selection);
    editor.destroy();
  });

  it("indents a bottom-up mixed range without widening its block selection", () => {
    const editor = createRivtoEditor();
    const previousId = editor.insertBlock({ type: "paragraph", content: "Previous" });
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" }, previousId);
    const middleId = editor.insertBlock({ type: "paragraph", content: "Middle" }, firstId);
    const lastId = editor.insertBlock({ type: "paragraph", content: "Last" }, middleId);
    const selection = [
      {
        type: "text" as const,
        anchor: { blockId: lastId, offset: 3 },
        head: { blockId: firstId, offset: 1 },
      },
      {
        type: "block" as const,
        blockIds: [middleId],
        anchorBlockId: middleId,
        focusBlockId: middleId,
      },
    ];
    editor.execute("selection.set", { selection });
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.indentBlock(lastId);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.getBlocks()).toMatchObject([{
      id: previousId,
      children: [{ id: firstId }, { id: middleId }, { id: lastId }],
    }]);
    expect(editor.selection.get()).toEqual(selection);
    editor.undo();
    expect(editor.getBlocks().map((block) => block.id)).toEqual([previousId, firstId, middleId, lastId]);
    unsubscribe();
    editor.destroy();
  });

  it("reorders block selection IDs after moving one selected block", () => {
    const editor = createRivtoEditor();
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    editor.execute("selection.set", {
      selection: [{
        type: "block",
        blockIds: [firstId, secondId],
        anchorBlockId: firstId,
        focusBlockId: secondId,
      }],
    });

    editor.moveBlock(firstId, secondId);

    expect(editor.getBlocks().map((block) => block.id)).toEqual([secondId, firstId]);
    expect(editor.selection.get()).toEqual([{
      type: "block",
      blockIds: [secondId, firstId],
      anchorBlockId: firstId,
      focusBlockId: secondId,
    }]);
    editor.undo();
    expect(editor.selection.get()).toEqual([{
      type: "block",
      blockIds: [firstId, secondId],
      anchorBlockId: firstId,
      focusBlockId: secondId,
    }]);
    editor.destroy();
  });
});
