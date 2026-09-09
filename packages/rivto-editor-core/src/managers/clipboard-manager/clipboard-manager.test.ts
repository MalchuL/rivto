/** Clipboard operations retain hierarchy and handle text ranges explicitly. */
import { createTestEditor as createRivtoEditor } from "../../editor/test-utils";

describe("core ClipboardManager", () => {
  it.each(["block", "edgeless"] as const)("replaces an explicit reverse text range in %s mode atomically", (mode) => {
    const editor = createRivtoEditor({ mode });
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "BeforeAfter",
      children: [{ type: "paragraph", content: "Keep child" }] });
    const textTarget = { type: "text" as const, anchor: { blockId: id, offset: 6 }, head: { blockId: id, offset: 0 } };
    const bundle = editor.clipboard.copyText(textTarget)!;
    expect(bundle.blocks[0]?.children).toEqual([]);
    expect(bundle.blocks[0]?.content).toBe("Before");
    const updates = jest.fn();
    editor.document.subscribe(updates);
    const caret = editor.clipboard.paste({ textTarget, text: "One\nTwo", defaultBlockType: "paragraph" });
    expect(updates).toHaveBeenCalledTimes(1);
    const roots = editor.blocks.getBlocks();
    expect(roots.map((block) => block.content)).toEqual(["One", "TwoAfter"]);
    expect(roots[0]?.children[0]?.content).toBe("Keep child");
    expect(caret).toEqual({ blockId: roots[1]!.id, offset: 3 });
    expect(editor.selection.get()).toEqual([]);
    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "BeforeAfter", children: [{ content: "Keep child" }] }]);
    editor.destroy();
  });

  it("rejects cross-block and invalid text inputs before mutating", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, first);
    const before = editor.dump();
    for (const head of [{ blockId: last, offset: 1 }, { blockId: first, offset: 99 }, { blockId: first, offset: -1 }]) {
      const textTarget = { type: "text" as const, anchor: { blockId: first, offset: 0 }, head };
      expect(() => editor.clipboard.copyText(textTarget)).toThrow("one existing block");
      expect(() => editor.clipboard.paste({ textTarget, text: "Replacement", defaultBlockType: "paragraph" })).toThrow("one existing block");
    }
    expect(editor.dump()).toEqual(before);
    editor.destroy();
  });

  it("imports older partial-text bundles with multiple blocks into an explicit target", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "LeftRight" });
    const bundle = { version: 4 as const, startsWithText: true, blocks: ["First", "Middle", "Last"].map((content) => ({
      id: content, type: "paragraph", content, props: {}, listProps: {}, pluginData: {}, children: [],
    })) };
    const caret = editor.clipboard.paste({ bundle, textTarget: {
      type: "text", anchor: { blockId: id, offset: 4 }, head: { blockId: id, offset: 4 },
    } });
    const blocks = editor.blocks.getBlocks();
    expect(blocks.map((block) => block.content)).toEqual(["LeftFirst", "Middle", "LastRight"]);
    expect(caret).toEqual({ blockId: blocks[2]!.id, offset: 4 });
    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "LeftRight" }]);
    editor.destroy();
  });

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
    const textTarget = {
      type: "text" as const,
      anchor: { blockId: id, offset: 0 },
      head: { blockId: id, offset: 8 },
    };

    const payload = editor.clipboard.copyText(textTarget)!;

    expect(payload.blocks[0]?.content).toBe("Selected");
    expect(editor.selection.get()).toEqual([]);
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
    const textTarget = {
      type: "text" as const,
      anchor: { blockId: targetId, offset: 0 },
      head: { blockId: targetId, offset: 0 },
    };
    target.clipboard.paste({
      textTarget,
      structured: JSON.stringify(payload),
      text: "plain",
    });
    expect(target.blocks.getBlocks().map(({ content }) => content)).toEqual(["", "Structured"]);


    target.clipboard.paste({ textTarget, text: "plain", defaultBlockType: "paragraph" });
    expect(target.blocks.getBlock(targetId)?.content).toBe("plain");
    target.clipboard.paste({
      textTarget: { type: "text", anchor: { blockId: targetId, offset: 5 }, head: { blockId: targetId, offset: 5 } },
      structured: JSON.stringify({ ...payload, version: 1 }),
      text: "fallback",
      defaultBlockType: "paragraph",
    });
    expect(target.blocks.getBlocks().map(({ content }) => content)).toEqual([
      "plainfallback",
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

  it("restores original block IDs when pasting a cut bundle", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "First",
      children: [{ type: "paragraph", content: "Nested" }],
    });
    const child = editor.blocks.getBlock(first)!.children[0]!.id;
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
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
    editor.destroy();
  });

  it("remints IDs when originals still exist in the destination", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
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
    const textTarget = {
      type: "text" as const,
      anchor: { blockId: id, offset: 7 },
      head: { blockId: id, offset: 7 },
    };

    editor.clipboard.paste({
      textTarget,
      text: "first\n    second",
      preserveNewlines: true,
      defaultBlockType: "paragraph",
    });

    expect(editor.blocks.getRootIds()).toEqual([id]);
    expect(editor.blocks.getBlock(id)?.content).toBe("Before first\n    second");
    editor.destroy();
  });

  it("does not claim the clipboard for a collapsed caret", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Hello" });
    const textTarget = {
      type: "text" as const,
      anchor: { blockId: id, offset: 2 },
      head: { blockId: id, offset: 2 },
    };

    expect(editor.clipboard.copyText(textTarget)).toBeUndefined();
    expect(editor.clipboard.cut()).toBeUndefined();
    expect(editor.blocks.getBlock(id)?.content).toBe("Hello");
    editor.destroy();
  });

  it("rejects cyclic structured clipboard input and no-ops without a text fallback", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Kept" });
    const cyclic = {
      id: "cycle",
      type: "paragraph",
      listProps: {},
      props: {},
      pluginData: {},
      content: "Loop",
      children: [] as unknown[],
    };
    cyclic.children.push(cyclic);

    editor.clipboard.paste({
      bundle: { version: 4, blocks: [cyclic] } as never,
    });
    expect(editor.blocks.getRootIds()).toEqual([id]);
    expect(editor.blocks.getBlock(id)?.content).toBe("Kept");
    editor.destroy();
  });
});
