import { createRivtoEditor, RIVTO_CLIPBOARD_MIME } from "../index";

describe("clipboard commands", () => {
  it("copies only selected text when its block has nested children", () => {
    const source = createRivtoEditor();
    const parent = source.insertBlock({ type: "paragraph", content: "Parent text" });
    const child = source.insertBlock({ type: "paragraph", content: "Nested child" }, parent);
    source.indentBlock(child);
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
    const parent = editor.insertBlock({
      type: "paragraph",
      content: "Parent",
      props: { level: 1 },
      pluginData: { local: { pinned: true } },
      layout: { x: 10, y: 20, width: 300, height: 90, zIndex: 2 },
    });
    const child = editor.insertBlock({ type: "paragraph", content: "Child" }, parent);
    editor.indentBlock(child);
    editor.createLink({ id: "link-1", from: { blockId: parent }, to: { blockId: child } });
    editor.execute("selection.set", {
      selection: [{ type: "block", blockIds: [parent, child], anchorBlockId: parent, focusBlockId: child }],
    });
    const data = new Map<string, string>();

    editor.execute("clipboard.copy", { clipboardData: { setData: (type: string, value: string) => data.set(type, value) } });

    const bundle = JSON.parse(data.get(RIVTO_CLIPBOARD_MIME)!) as {
      blocks: Array<{ id: string; props: Record<string, unknown>; pluginData: Record<string, unknown>; children: unknown[]; layout?: unknown }>;
      links: unknown[];
    };
    expect(bundle.blocks).toHaveLength(1);
    expect(bundle.blocks[0]?.id).toBe(parent);
    expect(bundle.blocks[0]?.props).toEqual({ level: 1 });
    expect(bundle.blocks[0]?.pluginData).toEqual({ local: { pinned: true } });
    expect(bundle.blocks[0]?.children).toHaveLength(1);
    expect(bundle.blocks[0]?.layout).toEqual({ x: 10, y: 20, width: 300, height: 90, zIndex: 2 });
    expect(bundle.links).toHaveLength(1);
    expect(data.get("text/plain")).toBe("Parent\nChild");
    editor.destroy();
  });

  it("copies and pastes a collapsed parent with its complete hidden subtree", () => {
    const source = createRivtoEditor();
    const parent = source.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Hidden child" }],
    });
    source.setBlockCollapsed(parent, true);
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [parent], anchorBlockId: parent, focusBlockId: parent }],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const target = createRivtoEditor();
    const destination = target.insertBlock({ type: "paragraph", content: "Destination" });
    target.execute("selection.set", {
      selection: [{ type: "block", blockIds: [destination], anchorBlockId: destination, focusBlockId: destination }],
    });
    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    const pasted = target.getBlocks()[1]!;
    expect(target.getBlockCollapsed(pasted.id)).toBe(true);
    expect(pasted.children).toMatchObject([{ content: "Hidden child" }]);
    source.destroy();
    target.destroy();
  });

  it("pastes structured blocks after a collapsed caret block", () => {
    const source = createRivtoEditor();
    const copied = source.insertBlock({ type: "paragraph", content: "Pasted" });
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [copied], anchorBlockId: copied, focusBlockId: copied }],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const target = createRivtoEditor();
    const parent = target.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Hidden child" }],
    });
    target.setBlocksCollapsed(parent, true);
    target.execute("selection.set", {
      selection: [{ type: "text", anchor: { blockId: parent, offset: 3 }, head: { blockId: parent, offset: 3 } }],
    });

    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    expect(target.getBlocks().map((block) => block.content)).toEqual(["Parent", "Pasted"]);
    expect(target.getBlock(parent)?.children).toMatchObject([{ content: "Hidden child" }]);
    source.destroy();
    target.destroy();
  });

  it("pastes selected blocks as fresh blocks instead of plain text", () => {
    const source = createRivtoEditor();
    const target = createRivtoEditor();
    const copied = source.insertBlock({ type: "paragraph", content: "Copied" });
    const destination = target.insertBlock({ type: "paragraph", content: "Destination" });
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [copied], anchorBlockId: copied, focusBlockId: copied }],
    });
    const data = new Map<string, string>();
    source.execute("clipboard.copy", { clipboardData: { setData: (type: string, value: string) => data.set(type, value) } });
    target.execute("selection.set", {
      selection: [{ type: "block", blockIds: [destination], anchorBlockId: destination, focusBlockId: destination }],
    });

    target.execute("clipboard.paste", { structured: data.get(RIVTO_CLIPBOARD_MIME) });

    expect(target.getBlock(destination)?.content).toBe("Destination");
    expect(target.getBlocks().map((block) => block.content)).toEqual(["Destination", "Copied"]);
    expect(target.getBlocks()[1]?.id).not.toBe(copied);
    source.destroy();
    target.destroy();
  });

  it("keeps a whole-block copy as a block when pasted at a text caret", () => {
    const source = createRivtoEditor();
    const target = createRivtoEditor();
    const copied = source.insertBlock({ type: "heading2", content: "Copied heading" });
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [copied], anchorBlockId: copied, focusBlockId: copied }],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const destination = target.insertBlock({ type: "paragraph", content: "Destination" });
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
    expect(target.getBlocks().map((block) => ({ type: block.type, content: block.content }))).toEqual([
      { type: "paragraph", content: "Destination" },
      { type: "heading2", content: "Copied heading" },
    ]);
    unsubscribe();

    target.undo();
    expect(target.getBlocks().map((block) => ({ type: block.type, content: block.content }))).toEqual([
      { type: "paragraph", content: "Destination" },
    ]);
    source.destroy();
    target.destroy();
  });

  it("does not special-case empty blocks that already have children", () => {
    const source = createRivtoEditor();
    const copied = source.insertBlock({ type: "heading2", content: "Pasted" });
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [copied], anchorBlockId: copied, focusBlockId: copied }],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const target = createRivtoEditor();
    const empty = target.insertBlock({ type: "paragraph", content: "" });
    const oldChild = target.insertBlock({ type: "paragraph", content: "Old child" }, empty);
    target.indentBlock(oldChild);
    target.execute("selection.set", {
      selection: [{ type: "text", anchor: { blockId: empty, offset: 0 }, head: { blockId: empty, offset: 0 } }],
    });

    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    expect(target.getBlocks().map((block) => block.content)).toEqual([""]);
    expect(target.getBlock(empty)?.children.map((block) => block.content)).toEqual(["Pasted", "Old child"]);
    source.destroy();
    target.destroy();
  });

  it("pastes at the start of a caret block's existing children atomically", () => {
    const source = createRivtoEditor();
    const first = source.insertBlock({ type: "paragraph", content: "Pasted first" });
    const second = source.insertBlock({ type: "paragraph", content: "Pasted second" }, first);
    source.execute("selection.set", {
      selection: [{ type: "block", blockIds: [first, second], anchorBlockId: first, focusBlockId: second }],
    });
    const clipboard = new Map<string, string>();
    source.execute("clipboard.copy", {
      clipboardData: { setData: (type: string, value: string) => clipboard.set(type, value) },
    });

    const target = createRivtoEditor();
    const parent = target.insertBlock({ type: "paragraph", content: "Parent" });
    const oldChild = target.insertBlock({ type: "paragraph", content: "Old child" }, parent);
    target.indentBlock(oldChild);
    target.execute("selection.set", {
      selection: [{ type: "text", anchor: { blockId: parent, offset: 3 }, head: { blockId: parent, offset: 3 } }],
    });
    const updates = jest.fn();
    const unsubscribe = target.document.subscribe(updates);

    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    expect(updates).toHaveBeenCalledTimes(1);
    expect(target.getBlocks()).toHaveLength(1);
    expect(target.getBlock(parent)?.children.map((block) => block.content)).toEqual([
      "Pasted first",
      "Pasted second",
      "Old child",
    ]);
    target.undo();
    expect(target.getBlock(parent)?.children.map((block) => block.content)).toEqual(["Old child"]);
    unsubscribe();
    source.destroy();
    target.destroy();
  });

  it("pastes a partial structured copy as text by default at a text caret", () => {
    const source = createRivtoEditor();
    const copied = source.insertBlock({ type: "paragraph", content: "Alpha" });
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
    const destination = target.insertBlock({ type: "paragraph", content: "Destination" });
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
    expect(target.getBlocks().map((block) => block.content)).toEqual(["Destlphination"]);
    expect(target.selection.get()).toEqual([{
      type: "text",
      anchor: { blockId: destination, offset: 7 },
      head: { blockId: destination, offset: 7 },
    }]);
    target.undo();
    expect(target.getBlocks().map((block) => block.content)).toEqual(["Destination"]);
    unsubscribe();
    source.destroy();
    target.destroy();
  });

  it("merges the first copied text and inserts every remaining item as a block", () => {
    const source = createRivtoEditor();
    const target = createRivtoEditor();
    const first = source.insertBlock({ type: "paragraph", content: "Alpha" });
    const second = source.insertBlock({ type: "heading2", content: "Middle" }, first);
    const third = source.insertBlock({ type: "bulletListItem", content: "Tail" }, second);
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

    const destination = target.insertBlock({ type: "paragraph", content: "LeftRight" });
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

    const pasted = target.getBlocks();
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
    expect(target.getBlocks().map((block) => ({ type: block.type, content: block.content }))).toEqual([
      { type: "paragraph", content: "LeftRight" },
    ]);
    unsubscribe();
    source.destroy();
    target.destroy();
  });

  it("splits multiline plain paste into sibling blocks and moves the suffix", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "HelloWorld" });
    editor.execute("selection.set", {
      selection: [{ type: "text", anchor: { blockId: id, offset: 5 }, head: { blockId: id, offset: 5 } }],
    });

    editor.execute("clipboard.paste", { text: " One\nTwo\nThree", defaultBlockType: "paragraph" });

    expect(editor.getBlocks().map((block) => block.content)).toEqual(["Hello One", "Two", "ThreeWorld"]);
    const last = editor.getBlocks()[2]!;
    expect(editor.selection.get()).toEqual([{
      type: "text",
      anchor: { blockId: last.id, offset: "Three".length },
      head: { blockId: last.id, offset: "Three".length },
    }]);
    editor.destroy();
  });

  it("cuts partial text and complete blocks from one mixed selection list", () => {
    const editor = createRivtoEditor();
    const first = editor.insertBlock({ type: "paragraph", content: "Hello" });
    const middle = editor.insertBlock({ type: "paragraph", content: "Whole" }, first);
    const last = editor.insertBlock({ type: "paragraph", content: "World" }, middle);
    editor.execute("selection.set", {
      selection: [
        { type: "text", anchor: { blockId: first, offset: 2 }, head: { blockId: first, offset: 5 } },
        { type: "block", blockIds: [middle], anchorBlockId: middle, focusBlockId: middle },
        { type: "text", anchor: { blockId: last, offset: 0 }, head: { blockId: last, offset: 3 } },
      ],
    });

    expect(editor.execute("clipboard.cut")).toBe("llo\nWhole\nWor");

    expect(editor.getBlocks().map((block) => block.content)).toEqual(["Held"]);
    expect(editor.selection.get()).toEqual([{
      type: "text",
      anchor: { blockId: first, offset: 2 },
      head: { blockId: first, offset: 2 },
    }]);
    editor.destroy();
  });

  it("deletes a block selection atomically and keeps one editable fallback", () => {
    const editor = createRivtoEditor();
    const first = editor.insertBlock({ type: "paragraph", content: "First" });
    const child = editor.insertBlock({ type: "paragraph", content: "Nested" }, first);
    editor.indentBlock(child);
    const second = editor.insertBlock({ type: "heading2", content: "Second" }, first);
    editor.execute("selection.set", {
      selection: [{ type: "block", blockIds: [first, second], anchorBlockId: first, focusBlockId: second }],
    });
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.deleteSelection();

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.getBlocks()).toMatchObject([{ type: "paragraph", content: "" }]);
    expect(editor.selection.get()).toEqual([{
      type: "text",
      anchor: { blockId: editor.getBlocks()[0]!.id, offset: 0 },
      head: { blockId: editor.getBlocks()[0]!.id, offset: 0 },
    }]);
    unsubscribe();

    editor.undo();
    expect(editor.getBlocks()).toMatchObject([
      { id: first, content: "First", children: [{ id: child, content: "Nested" }] },
      { id: second, content: "Second" },
    ]);

    editor.redo();
    expect(editor.getBlocks()).toMatchObject([{ type: "paragraph", content: "" }]);
    editor.destroy();
  });

  it("collapses a partial block deletion onto the next surviving block", () => {
    const editor = createRivtoEditor();
    const first = editor.insertBlock({ type: "paragraph", content: "First" });
    const selected = editor.insertBlock({ type: "paragraph", content: "Selected" }, first);
    const next = editor.insertBlock({ type: "paragraph", content: "Next" }, selected);
    editor.execute("selection.set", {
      selection: [{ type: "block", blockIds: [selected], anchorBlockId: selected, focusBlockId: selected }],
    });

    editor.deleteSelection();

    expect(editor.getBlocks().map((block) => block.id)).toEqual([first, next]);
    expect(editor.selection.get()).toEqual([{
      type: "text",
      anchor: { blockId: next, offset: 0 },
      head: { blockId: next, offset: 0 },
    }]);
    editor.destroy();
  });
});
