import { RIVTO_CLIPBOARD_MIME } from "../index";
import { createTestEditor as createRivtoEditor, createStructuralSelection, testRange } from "../test-utils";

describe("clipboard commands", () => {
  it("copies only selected text when its block has nested children", () => {
    const source = createRivtoEditor();
    const parent = source.blocks.insertBlock({ type: "paragraph", content: "Parent text" });
    const child = source.blocks.insertBlock({ type: "paragraph", content: "Nested child" }, parent);
    source.blocks.indentBlock(child);
    const sourceTextTarget = testRange(source, { blockId: parent, offset: 0 }, { blockId: parent, offset: 6 });
    const clipboard = new Map<string, string>();

    clipboard.set(RIVTO_CLIPBOARD_MIME,
      source.execute("clipboard.copy", { textTarget: sourceTextTarget }) as string);

    const bundle = JSON.parse(clipboard.get(RIVTO_CLIPBOARD_MIME)!) as {
      blocks: Array<{ content: string; children: unknown[] }>;
    };
    expect(clipboard.has("text/plain")).toBe(false);
    expect(bundle.blocks).toMatchObject([{ content: "Parent", children: [] }]);
    source.destroy();
  });

  it("serializes selected block subtrees with native data", () => {
    const editor = createRivtoEditor();
    const parent = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      props: { level: 1 },
      pluginData: { local: { pinned: true } },
    });
    const child = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, parent);
    editor.blocks.indentBlock(child);
    editor.execute("selection.set", {
      selection: createStructuralSelection([parent, child], parent, child),
    });
    const data = new Map<string, string>();

    data.set(RIVTO_CLIPBOARD_MIME, editor.execute("clipboard.copy") as string);

    const bundle = JSON.parse(data.get(RIVTO_CLIPBOARD_MIME)!) as {
      version: number;
      blocks: Array<{ id: string; props: Record<string, unknown>; pluginData: Record<string, unknown>; children: unknown[] }>;
    };
    expect(bundle.version).toBe(4);
    expect(bundle.blocks).toHaveLength(1);
    expect(bundle.blocks[0]?.id).toBe(parent);
    expect(bundle.blocks[0]?.props).toEqual({ level: 1 });
    expect(bundle.blocks[0]?.pluginData).toEqual({ local: { pinned: true } });
    expect(bundle.blocks[0]?.children).toHaveLength(1);
    expect([...data.keys()]).toEqual([RIVTO_CLIPBOARD_MIME]);
    editor.destroy();
  });

  it("copies and pastes a collapsed parent with its complete hidden subtree", () => {
    const source = createRivtoEditor();
    const parent = source.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Hidden child" }],
    });
    source.blocks.updateBlock(parent, { listProps: { collapsed: true } });
    source.execute("selection.set", {
      selection: createStructuralSelection([parent], parent, parent),
    });
    const clipboard = new Map<string, string>();
    clipboard.set(RIVTO_CLIPBOARD_MIME, source.execute("clipboard.copy") as string);

    const target = createRivtoEditor();
    const destination = target.blocks.insertBlock({ type: "paragraph", content: "Destination" });
    target.execute("selection.set", {
      selection: createStructuralSelection([destination], destination, destination),
    });
    target.execute("clipboard.paste", { structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    const pasted = target.blocks.getBlocks()[1]!;
    expect(pasted.listProps.collapsed).toBe(true);
    expect(pasted.children).toMatchObject([{ content: "Hidden child" }]);
    source.destroy();
    target.destroy();
  });

  it("pastes structured blocks after a collapsed caret block", () => {
    const source = createRivtoEditor();
    const copied = source.blocks.insertBlock({ type: "paragraph", content: "Pasted" });
    source.execute("selection.set", {
      selection: createStructuralSelection([copied], copied, copied),
    });
    const clipboard = new Map<string, string>();
    clipboard.set(RIVTO_CLIPBOARD_MIME, source.execute("clipboard.copy") as string);

    const target = createRivtoEditor();
    const parent = target.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Hidden child" }],
    });
    target.blocks.updateBlock(parent, { listProps: { collapsed: true } });
    const targetTextTarget = testRange(target, { blockId: parent, offset: 3 }, { blockId: parent, offset: 3 });

    target.execute("clipboard.paste", { textTarget: targetTextTarget,
      structured: clipboard.get(RIVTO_CLIPBOARD_MIME),
      placement: { parentId: null, afterId: parent },
    });

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
      selection: createStructuralSelection([copied], copied, copied),
    });
    const data = new Map<string, string>();
    data.set(RIVTO_CLIPBOARD_MIME, source.execute("clipboard.copy") as string);
    target.execute("selection.set", {
      selection: createStructuralSelection([destination], destination, destination),
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
      selection: createStructuralSelection([copied], copied, copied),
    });
    const clipboard = new Map<string, string>();
    clipboard.set(RIVTO_CLIPBOARD_MIME, source.execute("clipboard.copy") as string);

    const destination = target.blocks.insertBlock({ type: "paragraph", content: "Destination" });
    const targetTextTarget = testRange(target, { blockId: destination, offset: 4 }, { blockId: destination, offset: 4 });
    const documentUpdates = jest.fn();
    const unsubscribe = target.document.subscribe(documentUpdates);
    target.execute("clipboard.paste", { textTarget: targetTextTarget,
      structured: clipboard.get(RIVTO_CLIPBOARD_MIME),
      placement: { parentId: null, afterId: destination },
    });

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
      selection: createStructuralSelection([copied], copied, copied),
    });
    const clipboard = new Map<string, string>();
    clipboard.set(RIVTO_CLIPBOARD_MIME, source.execute("clipboard.copy") as string);

    const target = createRivtoEditor();
    const empty = target.blocks.insertBlock({ type: "paragraph", content: "" });
    const oldChild = target.blocks.insertBlock({ type: "paragraph", content: "Old child" }, empty);
    target.blocks.indentBlock(oldChild);
    const targetTextTarget = testRange(target, { blockId: empty, offset: 0 }, { blockId: empty, offset: 0 });

    target.execute("clipboard.paste", { textTarget: targetTextTarget,
      structured: clipboard.get(RIVTO_CLIPBOARD_MIME),
      placement: { parentId: empty, afterId: null },
    });

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
      selection: createStructuralSelection([first, second], first, second),
    });
    const clipboard = new Map<string, string>();
    clipboard.set(RIVTO_CLIPBOARD_MIME, source.execute("clipboard.copy") as string);

    const target = createRivtoEditor();
    const parent = target.blocks.insertBlock({ type: "paragraph", content: "Parent" });
    const oldChild = target.blocks.insertBlock({ type: "paragraph", content: "Old child" }, parent);
    target.blocks.indentBlock(oldChild);
    const targetTextTarget = testRange(target, { blockId: parent, offset: 3 }, { blockId: parent, offset: 3 });
    const updates = jest.fn();
    const unsubscribe = target.document.subscribe(updates);

    target.execute("clipboard.paste", { textTarget: targetTextTarget,
      structured: clipboard.get(RIVTO_CLIPBOARD_MIME),
      placement: { parentId: parent, afterId: null },
    });

    expect(updates).toHaveBeenCalledTimes(1);
    expect(target.blocks.getBlocks()).toHaveLength(1);
    expect(target.blocks.getBlock(parent)?.children.map((block) => block.content)).toEqual([
      "Pasted first",
      "Pasted second",
      "Old child",
    ]);
    const pastedIds = target.blocks.getChildIds(parent).slice(0, 2);
    expect(target.selection.get()).toMatchObject({
      type: "selection",
      blocks: pastedIds.map((id) => ({ id, start: 0, end: -1 })),
      anchorBlockId: pastedIds[0],
      focusBlockId: pastedIds[1],
    });
    target.undo();
    expect(target.blocks.getBlock(parent)?.children.map((block) => block.content)).toEqual(["Old child"]);
    unsubscribe();
    source.destroy();
    target.destroy();
  });

  it("pastes a partial structured copy as text by default at a text caret", () => {
    const source = createRivtoEditor();
    const copied = source.blocks.insertBlock({ type: "paragraph", content: "Alpha" });
    const sourceTextTarget = testRange(source, { blockId: copied, offset: 1 }, { blockId: copied, offset: 4 });
    const clipboard = new Map<string, string>();
    clipboard.set(RIVTO_CLIPBOARD_MIME,
      source.execute("clipboard.copy", { textTarget: sourceTextTarget }) as string);

    const target = createRivtoEditor();
    const destination = target.blocks.insertBlock({ type: "paragraph", content: "Destination" });
    const targetTextTarget = testRange(target, { blockId: destination, offset: 4 }, { blockId: destination, offset: 4 });
    const updates = jest.fn();
    const unsubscribe = target.document.subscribe(updates);

    const caret = target.execute("clipboard.paste", { textTarget: targetTextTarget, structured: clipboard.get(RIVTO_CLIPBOARD_MIME) });

    expect(updates).toHaveBeenCalledTimes(1);
    expect(target.blocks.getBlocks().map((block) => block.content)).toEqual(["Destlphination"]);
    expect(caret).toEqual({ blockId: destination, offset: 7 });
    expect(target.selection.get()).toMatchObject({
      blocks: [{ id: destination, start: 7, end: 7 }],
    });
    target.undo();
    expect(target.blocks.getBlocks().map((block) => block.content)).toEqual(["Destination"]);
    unsubscribe();
    source.destroy();
    target.destroy();
  });

  it("splits multiline plain paste into sibling blocks and moves the suffix", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "HelloWorld" });
    const editorTextTarget = testRange(editor, { blockId: id, offset: 5 }, { blockId: id, offset: 5 });

    const caret = editor.execute("clipboard.paste", { textTarget: editorTextTarget, text: " One\nTwo\nThree", defaultBlockType: "paragraph" });

    expect(editor.blocks.getBlocks().map((block) => block.content)).toEqual(["Hello One", "Two", "ThreeWorld"]);
    const last = editor.blocks.getBlocks()[2]!;
    expect(caret).toEqual({ blockId: last.id, offset: "Three".length });
    expect(editor.selection.get()).toMatchObject({
      blocks: [{ id: last.id, start: "Three".length, end: "Three".length }],
    });
    editor.destroy();
  });

  it("deletes a complete block selection atomically and leaves the document empty", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const child = editor.blocks.insertBlock({ type: "paragraph", content: "Nested" }, first);
    editor.blocks.indentBlock(child);
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
    editor.execute("selection.set", {
      selection: createStructuralSelection([first, second], first, second),
    });
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.deleteSelection();

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.selection.get()).toBeUndefined();
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
    editor.selection.set(createStructuralSelection([id], id, id));

    const clipboard = new Map<string, string>();
    const structured = editor.execute("clipboard.cut") as string;
    clipboard.set(RIVTO_CLIPBOARD_MIME, structured);
    expect(structured).toBe(clipboard.get(RIVTO_CLIPBOARD_MIME));
    expect(clipboard.has("text/markdown")).toBe(false);
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.selection.get()).toBeUndefined();

    editor.execute("clipboard.paste", { text: "First\nSecond", defaultBlockType: "paragraph" });
    expect(editor.blocks.getBlocks().map((block) => block.content)).toEqual(["First", "Second"]);
    editor.destroy();
  });

  it("clears selection after deleting blocks while preserving surrounding content", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const selected = editor.blocks.insertBlock({ type: "paragraph", content: "Selected" }, first);
    const next = editor.blocks.insertBlock({ type: "paragraph", content: "Next" }, selected);
    editor.execute("selection.set", {
      selection: createStructuralSelection([selected], selected, selected),
    });

    editor.deleteSelection();

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([first, next]);
    expect(editor.selection.get()).toBeUndefined();
    editor.destroy();
  });
});
