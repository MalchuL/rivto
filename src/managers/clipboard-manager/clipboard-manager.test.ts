import { createRivtoEditor } from "../../editor";

describe("core ClipboardManager", () => {
  it("copies and atomically cuts the current structured selection", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "Selected" });
    editor.selection.set([{
      type: "block",
      blockIds: [id],
      anchorBlockId: id,
      focusBlockId: id,
    }]);
    const updates = jest.fn();
    editor.document.subscribe(updates);

    expect(editor.clipboard.copy()?.text).toBe("Selected");
    expect(updates).not.toHaveBeenCalled();
    expect(editor.clipboard.cut()?.bundle.blocks).toMatchObject([{ id, content: "Selected" }]);
    expect(updates).toHaveBeenCalledTimes(1);
    expect(editor.getBlocks()).toMatchObject([{ type: "paragraph", content: "" }]);

    editor.undo();
    expect(editor.getBlocks()).toMatchObject([{ id, content: "Selected" }]);
    editor.destroy();
  });

  it("prefers structured data over plain text", () => {
    const source = createRivtoEditor();
    const copiedId = source.insertBlock({ type: "paragraph", content: "Structured" });
    source.selection.set([{
      type: "block",
      blockIds: [copiedId],
      anchorBlockId: copiedId,
      focusBlockId: copiedId,
    }]);
    const payload = source.clipboard.copy()!;

    const target = createRivtoEditor();
    const targetId = target.insertBlock({ type: "paragraph", content: "" });
    target.selection.set([{
      type: "text",
      anchor: { blockId: targetId, offset: 0 },
      head: { blockId: targetId, offset: 0 },
    }]);
    target.clipboard.paste({
      structured: JSON.stringify(payload.bundle),
      text: "plain",
    });
    expect(target.getBlocks().map(({ content }) => content)).toEqual(["", "Structured"]);

    target.selection.set([{
      type: "text",
      anchor: { blockId: targetId, offset: 0 },
      head: { blockId: targetId, offset: 0 },
    }]);
    target.clipboard.paste({ text: "plain" });
    expect(target.getBlock(targetId)?.content).toBe("plain");
    source.destroy();
    target.destroy();
  });
});
