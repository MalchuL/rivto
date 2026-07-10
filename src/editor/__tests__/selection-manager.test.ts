import { createRivtoEditor } from "../rivto-editor";

const textSelection = (blockId: string, anchor = 0, head = anchor) => ({
  type: "text" as const,
  anchor: { blockId, offset: anchor },
  head: { blockId, offset: head },
});

describe("EditorRuntime selection", () => {
  it("validates text, block, and edgeless selections", () => {
    const editor = createRivtoEditor();
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);

    editor.execute("selection.set", { selection: textSelection(firstId, 1, 4) });
    expect(editor.selection.get()).toEqual(textSelection(firstId, 1, 4));

    editor.execute("selection.set", {
      selection: { type: "block", blockIds: [secondId, firstId, secondId], anchorBlockId: secondId, focusBlockId: firstId },
    });
    expect(editor.selection.get()).toEqual({
      type: "block",
      blockIds: [firstId, secondId],
      anchorBlockId: secondId,
      focusBlockId: firstId,
    });

    expect(() => editor.execute("selection.set", {
      selection: { type: "text", anchor: { blockId: firstId, offset: 99 }, head: { blockId: firstId, offset: 99 } },
    })).toThrow("outside block");
    expect(() => editor.execute("selection.set", {
      selection: { type: "edgeless", blockIds: [firstId] },
    })).toThrow("requires edgeless");

    editor.mode.set("edgeless");
    editor.execute("selection.set", { selection: { type: "edgeless", blockIds: [firstId] } });
    expect(editor.selection.get()).toEqual({ type: "edgeless", blockIds: [firstId] });
    editor.destroy();
  });

  it("notifies runtime subscribers when selection changes", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "Text" });
    const listener = jest.fn();
    const unsubscribe = editor.subscribe(listener);

    editor.execute("selection.set", { selection: textSelection(id, 0, 2) });
    editor.execute("selection.clear");

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    editor.destroy();
  });

  it("clears invalid selection after document or mode changes", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph" });

    editor.execute("selection.set", { selection: { type: "block", blockIds: [id], anchorBlockId: id, focusBlockId: id } });
    editor.removeBlock(id);

    expect(editor.selection.get()).toBeNull();

    const nextId = editor.insertBlock({ type: "paragraph" });
    editor.mode.set("edgeless");
    editor.execute("selection.set", { selection: { type: "edgeless", blockIds: [nextId] } });
    editor.mode.set("block");

    expect(editor.selection.get()).toBeNull();
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
      selection: {
        type: "block",
        blockIds: [firstChildId, secondChildId],
        anchorBlockId: secondChildId,
        focusBlockId: firstChildId,
      },
    });
    editor.outdentBlock(firstChildId);

    expect(editor.getBlocks().map((block) => block.id)).toEqual([parentId, firstChildId, secondChildId]);
    expect(editor.selection.get()).toEqual({
      type: "block",
      blockIds: [firstChildId, secondChildId],
      anchorBlockId: secondChildId,
      focusBlockId: firstChildId,
    });
    editor.destroy();
  });
});
