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
    expect(editor.getBlocks()).toEqual([]);
    expect(editor.selection.get()).toEqual([]);

    editor.undo();
    expect(editor.getBlocks()).toMatchObject([{ id, content: "Selected" }]);
    editor.destroy();
  });

  it("preserves copied hierarchy in plain text, HTML, and Markdown", () => {
    const editor = createRivtoEditor();
    const first = editor.insertBlock({
      type: "paragraph",
      content: "Root <one>\nline",
      children: [{
        type: "paragraph",
        content: "Child\ncontinuation",
        children: [{ type: "paragraph", content: "Grandchild" }],
      }],
    });
    editor.updateBlock(first, { collapsed: true });
    const second = editor.insertBlock({ type: "paragraph", content: "Second" }, first);
    editor.selection.set([{
      type: "block",
      blockIds: [first, second],
      anchorBlockId: first,
      focusBlockId: second,
    }]);

    const payload = editor.clipboard.copy()!;

    expect(payload.text).toBe("Root <one>\nline\n  Child\n  continuation\n    Grandchild\nSecond");
    expect(payload.html).toBe(
      "<p>Root &lt;one&gt;<br>line</p><ul><li>Child<br>continuation<ul><li>Grandchild</li></ul></li></ul><p>Second</p>",
    );
    expect(payload.markdown).toBe("Root <one>\nline\n- Child\n  continuation\n  - Grandchild\nSecond");
    expect(payload.bundle.blocks).toMatchObject([{
      id: first,
      collapsed: true,
      children: [{ content: "Child\ncontinuation", children: [{ content: "Grandchild" }] }],
    }, { id: second }]);
    editor.destroy();
  });

  it("uses block raw-text converters after trimming copied text", () => {
    const editor = createRivtoEditor();
    editor.defineBlock({
      type: "test.raw",
      toRawText: (block) => `Raw: ${block.content}`,
    });
    const id = editor.insertBlock({ type: "test.raw", content: "Selected text" });
    editor.selection.set([{
      type: "text",
      anchor: { blockId: id, offset: 0 },
      head: { blockId: id, offset: 8 },
    }]);

    const payload = editor.clipboard.copy()!;

    expect(payload.text).toBe("Raw: Selected");
    expect(payload.html).toBe("<p>Raw: Selected</p>");
    expect(payload.markdown).toBe("Raw: Selected");
    expect(payload.bundle.blocks[0]?.content).toBe("Selected");
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
    expect(payload.bundle.version).toBe(2);

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
    expect(() => target.clipboard.paste({
      structured: JSON.stringify({ ...payload.bundle, version: 1 }),
    })).not.toThrow();
    expect(target.getBlocks().map(({ content }) => content)).toEqual([
      "plain",
      "Structured",
      "Structured",
    ]);
    source.destroy();
    target.destroy();
  });

  it("preserves multiline plain text inside one block when requested", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "Before " });
    editor.selection.set([{
      type: "text",
      anchor: { blockId: id, offset: 7 },
      head: { blockId: id, offset: 7 },
    }]);

    editor.clipboard.paste({
      text: "first\n    second",
      preserveNewlines: true,
    });

    expect(editor.getRootIds()).toEqual([id]);
    expect(editor.getBlock(id)?.content).toBe("Before first\n    second");
    editor.destroy();
  });
});
