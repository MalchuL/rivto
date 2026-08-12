import { createTestEditor as createRivtoEditor } from "../../editor/test-utils";

describe("core ClipboardManager", () => {
  it("copies and atomically cuts the current structured selection", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Selected" });
    editor.selection.set([{
      type: "block",
      blockIds: [id],
      anchorBlockId: id,
      focusBlockId: id,
    }]);
    const updates = jest.fn();
    editor.document.subscribe(updates);

    expect(editor.clipboard.copy()?.blocks[0]?.content).toBe("Selected");
    expect(updates).not.toHaveBeenCalled();
    expect(editor.clipboard.cut()?.blocks).toMatchObject([{ id, content: "Selected" }]);
    expect(updates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.selection.get()).toEqual([]);

    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Selected" }]);
    editor.destroy();
  });

  it("preserves copied hierarchy in the structured bundle", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Root <one>\nline",
      children: [{
        type: "paragraph",
        content: "Child\ncontinuation",
        children: [{ type: "paragraph", content: "Grandchild" }],
      }],
    });
    editor.blocks.updateBlock(first, { listProps: { collapsed: true } });
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
    editor.selection.set([{
      type: "block",
      blockIds: [first, second],
      anchorBlockId: first,
      focusBlockId: second,
    }]);

    const payload = editor.clipboard.copy()!;

    expect(payload.blocks).toMatchObject([{
      id: first,
      listProps: { collapsed: true },
      children: [{ content: "Child\ncontinuation", children: [{ content: "Grandchild" }] }],
    }, { id: second }]);
    editor.destroy();
  });

  it("trims copied text in the structured bundle", () => {
    const editor = createRivtoEditor();
    editor.blocksRegistry.defineBlock({ type: "test.raw" });
    const id = editor.blocks.insertBlock({ type: "test.raw", content: "Selected text" });
    editor.selection.set([{
      type: "text",
      anchor: { blockId: id, offset: 0 },
      head: { blockId: id, offset: 8 },
    }]);

    const payload = editor.clipboard.copy()!;

    expect(payload.blocks[0]?.content).toBe("Selected");
    editor.destroy();
  });

  it("does not interpret extension-owned list properties", () => {
    const editor = createRivtoEditor();
    const start = editor.blocks.insertBlock({ type: "paragraph", content: "One", listProps: { type: "start_numbered_list" } });
    const next = editor.blocks.insertBlock({ type: "paragraph", content: "Two", listProps: { type: "numbered_list" } }, start);
    const gap = editor.blocks.insertBlock({ type: "paragraph", content: "Gap" }, next);
    const task = editor.blocks.insertBlock({ type: "paragraph", content: "Done", listProps: { type: "checkbox", checked: true } }, gap);
    const resume = editor.blocks.insertBlock({ type: "paragraph", content: "Three", listProps: { type: "continue_numbered_list" } }, task);
    editor.selection.set([{
      type: "block",
      blockIds: [start, next, gap, task, resume],
      anchorBlockId: start,
      focusBlockId: resume,
    }]);

    const payload = editor.clipboard.copy()!;
    expect(payload.blocks).toMatchObject([
      { listProps: { type: "start_numbered_list" } },
      { listProps: { type: "numbered_list" } },
      { listProps: {} },
      { listProps: { type: "checkbox", checked: true } },
      { listProps: { type: "continue_numbered_list" } },
    ]);
    const target = createRivtoEditor();
    target.clipboard.paste({ bundle: payload, mergeText: false });
    expect(target.blocks.getBlocks()).toMatchObject([
      { listProps: { type: "start_numbered_list" } },
      { listProps: { type: "numbered_list" } },
      { listProps: {} },
      { listProps: { type: "checkbox", checked: true } },
      { listProps: { type: "continue_numbered_list" } },
    ]);
    target.destroy();
    editor.destroy();
  });

  it("prefers structured data over plain text", () => {
    const source = createRivtoEditor();
    const copiedId = source.blocks.insertBlock({ type: "paragraph", content: "Structured" });
    source.selection.set([{
      type: "block",
      blockIds: [copiedId],
      anchorBlockId: copiedId,
      focusBlockId: copiedId,
    }]);
    const payload = source.clipboard.copy()!;
    expect(payload.version).toBe(4);

    const target = createRivtoEditor();
    const targetId = target.blocks.insertBlock({ type: "paragraph", content: "" });
    target.selection.set([{
      type: "text",
      anchor: { blockId: targetId, offset: 0 },
      head: { blockId: targetId, offset: 0 },
    }]);
    target.clipboard.paste({
      structured: JSON.stringify(payload),
      text: "plain",
    });
    expect(target.blocks.getBlocks().map(({ content }) => content)).toEqual(["", "Structured"]);

    target.selection.set([{
      type: "text",
      anchor: { blockId: targetId, offset: 0 },
      head: { blockId: targetId, offset: 0 },
    }]);
    target.clipboard.paste({ text: "plain", defaultBlockType: "paragraph" });
    expect(target.blocks.getBlock(targetId)?.content).toBe("plain");
    expect(() => target.clipboard.paste({
      structured: JSON.stringify({ ...payload, version: 1 }),
    })).not.toThrow();
    expect(target.blocks.getBlocks().map(({ content }) => content)).toEqual([
      "plain",
      "Structured",
      "Structured",
    ]);
    source.destroy();
    target.destroy();
  });

  it("places paste after a selected parent when focus ends on its nested child", () => {
    const editor = createRivtoEditor();
    const parent = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Child" }],
    });
    const child = editor.blocks.getChildIds(parent)[0]!;
    const tail = editor.blocks.insertBlock({ type: "paragraph", content: "Tail" }, parent);
    editor.selection.set([{
      type: "block",
      blockIds: [parent, child],
      anchorBlockId: parent,
      focusBlockId: child,
    }]);

    editor.clipboard.paste({
      bundle: {
        version: 4,
        blocks: [{
          id: "clipboard-block",
          type: "paragraph",
          listProps: {},
          props: {},
          pluginData: {},
          content: "Pasted",
          children: [],
        }],
        links: [],
      },
      mergeText: false,
      placement: { parentId: parent, afterId: child },
    });

    const roots = editor.blocks.getBlocks();
    expect(roots.map(({ content }) => content)).toEqual(["Parent", "Pasted", "Tail"]);
    expect(roots.map(({ id }) => id)).toEqual([parent, expect.any(String), tail]);
    expect(editor.blocks.getBlock(parent)?.children.map(({ id }) => id)).toEqual([child]);
    editor.destroy();
  });

  it("restores original block and link IDs when pasting a cut bundle", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "First",
      children: [{ type: "paragraph", content: "Nested" }],
    });
    const child = editor.blocks.getBlock(first)!.children[0]!.id;
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
    editor.links.createLink({ id: "cut-link", from: { blockId: first }, to: { blockId: second } });
    editor.selection.set([{
      type: "block",
      blockIds: [first, second],
      anchorBlockId: first,
      focusBlockId: second,
    }]);

    const payload = editor.clipboard.cut()!;
    editor.clipboard.paste({ bundle: payload, mergeText: false });

    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: first, content: "First", children: [{ id: child, content: "Nested" }] },
      { id: second, content: "Second" },
    ]);
    expect(editor.links.getLinks()).toMatchObject([
      { id: "cut-link", from: { blockId: first }, to: { blockId: second } },
    ]);
    editor.destroy();
  });

  it("remints IDs when originals still exist in the destination", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
    editor.links.createLink({ id: "copy-link", from: { blockId: first }, to: { blockId: second } });
    editor.selection.set([{
      type: "block",
      blockIds: [first, second],
      anchorBlockId: first,
      focusBlockId: second,
    }]);

    const payload = editor.clipboard.copy()!;
    editor.clipboard.paste({ bundle: payload, mergeText: false });

    const ids = editor.blocks.getBlocks().map((block) => block.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids.slice(0, 2)).toEqual([first, second]);
    const linkIds = editor.links.getLinks().map((link) => link.id);
    expect(linkIds).toHaveLength(2);
    expect(linkIds).toContain("copy-link");
    expect(new Set(linkIds).size).toBe(2);
    editor.destroy();
  });

  it("remints IDs when pasting the same cut bundle a second time", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Twice" });
    editor.selection.set([{
      type: "block",
      blockIds: [id],
      anchorBlockId: id,
      focusBlockId: id,
    }]);

    const payload = editor.clipboard.cut()!;
    editor.clipboard.paste({ bundle: payload, mergeText: false });
    editor.clipboard.paste({ bundle: payload, mergeText: false });

    const ids = editor.blocks.getBlocks().map((block) => block.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(id);
    expect(ids[1]).not.toBe(id);
    editor.destroy();
  });

  it("preserves multiline plain text inside one block when requested", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Before " });
    editor.selection.set([{
      type: "text",
      anchor: { blockId: id, offset: 7 },
      head: { blockId: id, offset: 7 },
    }]);

    editor.clipboard.paste({
      text: "first\n    second",
      preserveNewlines: true,
      defaultBlockType: "paragraph",
    });

    expect(editor.blocks.getRootIds()).toEqual([id]);
    expect(editor.blocks.getBlock(id)?.content).toBe("Before first\n    second");
    editor.destroy();
  });
});
