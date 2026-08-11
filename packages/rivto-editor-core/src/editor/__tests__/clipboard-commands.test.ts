import { RIVTO_CLIPBOARD_MIME } from "../index";
import { createTestEditor as createRivtoEditor } from "../test-utils";

describe("clipboard commands", () => {
  it("copies only selected text when its block has nested children", () => {
    const source = createRivtoEditor();
    const parent = source.blocks.insertBlock({ type: "paragraph", content: "Parent text" });
    const child = source.blocks.insertBlock({ type: "paragraph", content: "Nested child" }, parent);
    source.blocks.indentBlock(child);
    source.execute("selection.set", {
      selection: [{
        type: "text",
        anchor: { blockId: parent, offset: 0 },
        head: { blockId: parent, offset: 6 },
      }],
    });
    const clipboard = new Map<string, string>();

    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const bundle = JSON.parse(clipboard.get(RIVTO_CLIPBOARD_MIME)!) as {
      blocks: Array<{ content: string; children: unknown[] }>;
    };
    expect(clipboard.get("text/plain")).toBe("Parent");
    expect(bundle.blocks).toMatchObject([{ content: "Parent", children: [] }]);
    source.destroy();
  });

  it("serializes selected block subtrees with native data and internal links", () => {
    const editor = createRivtoEditor();
    const parent = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      props: { level: 1 },
      pluginData: { local: { pinned: true } },
    });
    const child = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, parent);
    editor.blocks.indentBlock(child);
    editor.links.createLink({ id: "link-1", from: { blockId: parent }, to: { blockId: child } });
    editor.execute("selection.set", {
      selection: [{ type: "block", blockIds: [parent, child], anchorBlockId: parent, focusBlockId: child }],
    });
    const data = new Map<string, string>();

    editor.execute("clipboard.copy", { clipboardData: { setData: (type: string, value: string) => data.set(type, value) } });

    const bundle = JSON.parse(data.get(RIVTO_CLIPBOARD_MIME)!) as {
      version: number;
      blocks: Array<{ id: string; props: Record<string, unknown>; pluginData: Record<string, unknown>; children: unknown[] }>;
      links: unknown[];
    };
    expect(bundle.version).toBe(3);
    expect(bundle.blocks).toHaveLength(1);
    expect(bundle.blocks[0]?.id).toBe(parent);
    expect(bundle.blocks[0]?.props).toEqual({ level: 1 });
    expect(bundle.blocks[0]?.pluginData).toEqual({ local: { pinned: true } });
    expect(bundle.blocks[0]?.children).toHaveLength(1);
    expect(bundle.links).toHaveLength(1);
    expect(data.get("text/plain")).toBe("Parent\n  Child");
    expect(data.get("text/html")).toBe("<p>Parent</p><ul><li>Child</li></ul>");
    expect(data.get("text/markdown")).toBe("Parent\n- Child");
    editor.destroy();
  });

  it("copies and pastes a collapsed parent with its complete hidden subtree", () => {
    const source = createRivtoEditor();
    const parent = source.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Hidden child" }],
    });
    source.blocks.updateBlock(parent, { collapsed: true });
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [parent], anchorBlockId: parent, focusBlockId: parent }],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const target = createRivtoEditor();
    const destination = target.blocks.insertBlock({ type: "paragraph", content: "Destination" });
    target.execute("selection.set", {
      selection: [{ type: "block", blockIds: [destination], anchorBlockId: destination, focusBlockId: destination }],
    });
    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    const pasted = target.blocks.getBlocks()[1]!;
    expect(pasted.collapsed).toBe(true);
    expect(pasted.children).toMatchObject([{ content: "Hidden child" }]);
    source.destroy();
    target.destroy();
  });

  it("pastes structured blocks after a collapsed caret block", () => {
    const source = createRivtoEditor();
    const copied = source.blocks.insertBlock({ type: "paragraph", content: "Pasted" });
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [copied], anchorBlockId: copied, focusBlockId: copied }],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const target = createRivtoEditor();
    const parent = target.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Hidden child" }],
    });
    target.blocks.updateBlock(parent, { collapsed: true });
    target.execute("selection.set", {
      selection: [{ type: "text", anchor: { blockId: parent, offset: 3 }, head: { blockId: parent, offset: 3 } }],
    });

    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    expect(target.blocks.getBlocks().map((block) => block.content)).toEqual(["Parent", "Pasted"]);
    expect(target.blocks.getBlock(parent)?.children).toMatchObject([{ content: "Hidden child" }]);
    source.destroy();
    target.destroy();
  });

  it("pastes selected blocks as fresh blocks instead of plain text", () => {
    const source = createRivtoEditor();
    const target = createRivtoEditor();
    const copied = source.blocks.insertBlock({ type: "paragraph", content: "Copied" });
    const destination = target.blocks.insertBlock({ type: "paragraph", content: "Destination" });
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [copied], anchorBlockId: copied, focusBlockId: copied }],
    });
    const data = new Map<string, string>();
    source.execute("clipboard.copy", { clipboardData: { setData: (type: string, value: string) => data.set(type, value) } });
    target.execute("selection.set", {
      selection: [{ type: "block", blockIds: [destination], anchorBlockId: destination, focusBlockId: destination }],
    });

    target.execute("clipboard.paste", { structured: data.get(RIVTO_CLIPBOARD_MIME) });

    expect(target.blocks.getBlock(destination)?.content).toBe("Destination");
    expect(target.blocks.getBlocks().map((block) => block.content)).toEqual(["Destination", "Copied"]);
    expect(target.blocks.getBlocks()[1]?.id).toBe(copied);
    source.destroy();
    target.destroy();
  });

  it("keeps a whole-block copy as a block when pasted at a text caret", () => {
    const source = createRivtoEditor();
    source.blocksRegistry.defineBlock({ type: "heading2" });
    const target = createRivtoEditor();
    const copied = source.blocks.insertBlock({ type: "heading2", content: "Copied heading" });
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [copied], anchorBlockId: copied, focusBlockId: copied }],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const destination = target.blocks.insertBlock({ type: "paragraph", content: "Destination" });
    target.execute("selection.set", {
      selection: [{
        type: "text",
        anchor: { blockId: destination, offset: 4 },
        head: { blockId: destination, offset: 4 },
      }],
    });
    const documentUpdates = jest.fn();
    const unsubscribe = target.document.subscribe(documentUpdates);
    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(target.blocks.getBlocks().map((block) => ({ type: block.type, content: block.content }))).toEqual([
      { type: "paragraph", content: "Destination" },
      { type: "heading2", content: "Copied heading" },
    ]);
    unsubscribe();

    target.undo();
    expect(target.blocks.getBlocks().map((block) => ({ type: block.type, content: block.content }))).toEqual([
      { type: "paragraph", content: "Destination" },
    ]);
    source.destroy();
    target.destroy();
  });

  it("does not special-case empty blocks that already have children", () => {
    const source = createRivtoEditor();
    source.blocksRegistry.defineBlock({ type: "heading2" });
    const copied = source.blocks.insertBlock({ type: "heading2", content: "Pasted" });
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [copied], anchorBlockId: copied, focusBlockId: copied }],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const target = createRivtoEditor();
    const empty = target.blocks.insertBlock({ type: "paragraph", content: "" });
    const oldChild = target.blocks.insertBlock({ type: "paragraph", content: "Old child" }, empty);
    target.blocks.indentBlock(oldChild);
    target.execute("selection.set", {
      selection: [{ type: "text", anchor: { blockId: empty, offset: 0 }, head: { blockId: empty, offset: 0 } }],
    });

    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    expect(target.blocks.getBlocks().map((block) => block.content)).toEqual([""]);
    expect(target.blocks.getBlock(empty)?.children.map((block) => block.content)).toEqual(["Pasted", "Old child"]);
    source.destroy();
    target.destroy();
  });

  it("pastes at the start of a caret block's existing children atomically", () => {
    const source = createRivtoEditor();
    const first = source.blocks.insertBlock({ type: "paragraph", content: "Pasted first" });
    const second = source.blocks.insertBlock({ type: "paragraph", content: "Pasted second" }, first);
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [first, second], anchorBlockId: first, focusBlockId: second }],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const target = createRivtoEditor();
    const parent = target.blocks.insertBlock({ type: "paragraph", content: "Parent" });
    const oldChild = target.blocks.insertBlock({ type: "paragraph", content: "Old child" }, parent);
    target.blocks.indentBlock(oldChild);
    target.execute("selection.set", {
      selection: [{ type: "text", anchor: { blockId: parent, offset: 3 }, head: { blockId: parent, offset: 3 } }],
    });
    const updates = jest.fn();
    const unsubscribe = target.document.subscribe(updates);

    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    expect(updates).toHaveBeenCalledTimes(1);
    expect(target.blocks.getBlocks()).toHaveLength(1);
    expect(target.blocks.getBlock(parent)?.children.map((block) => block.content)).toEqual([
      "Pasted first",
      "Pasted second",
      "Old child",
    ]);
    const pastedIds = target.blocks.getChildIds(parent).slice(0, 2);
    expect(target.selection.get()).toEqual([{
      type: "block",
      blockIds: pastedIds,
      anchorBlockId: pastedIds[0],
      focusBlockId: pastedIds[1],
    }]);
    target.undo();
    expect(target.blocks.getBlock(parent)?.children.map((block) => block.content)).toEqual(["Old child"]);
    unsubscribe();
    source.destroy();
    target.destroy();
  });

  it("pastes a partial structured copy as text by default at a text caret", () => {
    const source = createRivtoEditor();
    const copied = source.blocks.insertBlock({ type: "paragraph", content: "Alpha" });
    source.execute("selection.set", {
      selection: [{
        type: "text",
        anchor: { blockId: copied, offset: 1 },
        head: { blockId: copied, offset: 4 },
      }],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const target = createRivtoEditor();
    const destination = target.blocks.insertBlock({ type: "paragraph", content: "Destination" });
    target.execute("selection.set", {
      selection: [{
        type: "text",
        anchor: { blockId: destination, offset: 4 },
        head: { blockId: destination, offset: 4 },
      }],
    });
    const updates = jest.fn();
    const unsubscribe = target.document.subscribe(updates);

    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    expect(updates).toHaveBeenCalledTimes(1);
    expect(target.blocks.getBlocks().map((block) => block.content)).toEqual(["Destlphination"]);
    expect(target.selection.get()).toEqual([{
      type: "text",
      anchor: { blockId: destination, offset: 7 },
      head: { blockId: destination, offset: 7 },
    }]);
    target.undo();
    expect(target.blocks.getBlocks().map((block) => block.content)).toEqual(["Destination"]);
    unsubscribe();
    source.destroy();
    target.destroy();
  });

  it("merges the first copied text and inserts every remaining item as a block", () => {
    const source = createRivtoEditor();
    source.blocksRegistry.defineBlock({ type: "heading2" });
    source.blocksRegistry.defineBlock({ type: "bulletListItem" });
    const target = createRivtoEditor();
    const first = source.blocks.insertBlock({ type: "paragraph", content: "Alpha" });
    const second = source.blocks.insertBlock({ type: "heading2", content: "Middle" }, first);
    const third = source.blocks.insertBlock({ type: "bulletListItem", content: "Tail" }, second);
    source.execute("selection.set", {
      selection: [
        { type: "text", anchor: { blockId: first, offset: 2 }, head: { blockId: first, offset: 5 } },
        { type: "block", blockIds: [second, third], anchorBlockId: second, focusBlockId: third },
      ],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const destination = target.blocks.insertBlock({ type: "paragraph", content: "LeftRight" });
    target.execute("selection.set", {
      selection: [{
        type: "text",
        anchor: { blockId: destination, offset: 4 },
        head: { blockId: destination, offset: 4 },
      }],
    });
    const documentUpdates = jest.fn();
    const unsubscribe = target.document.subscribe(documentUpdates);
    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    const pasted = target.blocks.getBlocks();
    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(pasted.map((block) => ({ type: block.type, content: block.content }))).toEqual([
      { type: "paragraph", content: "Leftpha" },
      { type: "heading2", content: "Middle" },
      { type: "bulletListItem", content: "TailRight" },
    ]);
    expect(target.selection.get()).toEqual([{
      type: "text",
      anchor: { blockId: pasted[2]!.id, offset: 4 },
      head: { blockId: pasted[2]!.id, offset: 4 },
    }]);
    target.undo();
    expect(target.blocks.getBlocks().map((block) => ({ type: block.type, content: block.content }))).toEqual([
      { type: "paragraph", content: "LeftRight" },
    ]);
    unsubscribe();
    source.destroy();
    target.destroy();
  });

  it("splits multiline plain paste into sibling blocks and moves the suffix", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "HelloWorld" });
    editor.execute("selection.set", {
      selection: [{ type: "text", anchor: { blockId: id, offset: 5 }, head: { blockId: id, offset: 5 } }],
    });

    editor.execute("clipboard.paste", { text: " One\nTwo\nThree", defaultBlockType: "paragraph" });

    expect(editor.blocks.getBlocks().map((block) => block.content)).toEqual(["Hello One", "Two", "ThreeWorld"]);
    const last = editor.blocks.getBlocks()[2]!;
    expect(editor.selection.get()).toEqual([{
      type: "text",
      anchor: { blockId: last.id, offset: "Three".length },
      head: { blockId: last.id, offset: "Three".length },
    }]);
    editor.destroy();
  });

  it("cuts partial text and complete blocks from one mixed selection list", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "Hello" });
    const middle = editor.blocks.insertBlock({ type: "paragraph", content: "Whole" }, first);
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "World" }, middle);
    editor.execute("selection.set", {
      selection: [
        { type: "text", anchor: { blockId: first, offset: 2 }, head: { blockId: first, offset: 5 } },
        { type: "block", blockIds: [middle], anchorBlockId: middle, focusBlockId: middle },
        { type: "text", anchor: { blockId: last, offset: 0 }, head: { blockId: last, offset: 3 } },
      ],
    });

    expect(editor.execute("clipboard.cut")).toBe("llo\nWhole\nWor");

    expect(editor.blocks.getBlocks().map((block) => block.content)).toEqual(["Held"]);
    expect(editor.selection.get()).toEqual([{
      type: "text",
      anchor: { blockId: first, offset: 2 },
      head: { blockId: first, offset: 2 },
    }]);
    editor.destroy();
  });

  it("deletes a complete block selection atomically and leaves the document empty", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const child = editor.blocks.insertBlock({ type: "paragraph", content: "Nested" }, first);
    editor.blocks.indentBlock(child);
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
    editor.execute("selection.set", {
      selection: [{ type: "block", blockIds: [first, second], anchorBlockId: first, focusBlockId: second }],
    });
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.deleteSelection();

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.selection.get()).toEqual([]);
    unsubscribe();

    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: first, content: "First", children: [{ id: child, content: "Nested" }] },
      { id: second, content: "Second" },
    ]);

    editor.redo();
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.destroy();
  });

  it("cuts the final block and can paste plain text into the empty document", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Only block" });
    editor.selection.set([{
      type: "block",
      blockIds: [id],
      anchorBlockId: id,
      focusBlockId: id,
    }]);

    const clipboard = new Map<string, string>();
    expect(editor.execute("clipboard.cut", {
      clipboardData: {
        getData: (type: string) => clipboard.get(type) ?? "",
        setData: (type: string, value: string) => clipboard.set(type, value),
      },
      preventDefault: jest.fn(),
    })).toBe("Only block");
    expect(clipboard.get("text/markdown")).toBe("Only block");
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.selection.get()).toEqual([]);

    editor.execute("clipboard.paste", { text: "First\nSecond", defaultBlockType: "paragraph" });
    expect(editor.blocks.getBlocks().map((block) => block.content)).toEqual(["First", "Second"]);
    editor.destroy();
  });

  it("collapses a partial block deletion onto the next surviving block", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const selected = editor.blocks.insertBlock({ type: "paragraph", content: "Selected" }, first);
    const next = editor.blocks.insertBlock({ type: "paragraph", content: "Next" }, selected);
    editor.execute("selection.set", {
      selection: [{ type: "block", blockIds: [selected], anchorBlockId: selected, focusBlockId: selected }],
    });

    editor.deleteSelection();

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([first, next]);
    expect(editor.selection.get()).toEqual([{
      type: "text",
      anchor: { blockId: next, offset: 0 },
      head: { blockId: next, offset: 0 },
    }]);
    editor.destroy();
  });
});
