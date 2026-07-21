import * as Y from "yjs";
import { z } from "zod";
import { BLOCK_COLLAPSED_PROP } from "../../blocks";
import { YjsDoc } from "../../store/crdt-doc";
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

  it("validates and preserves the reserved collapse property across block types", () => {
    const editor = createRivtoEditor();
    editor.defineBlock({
      type: "strict",
      propSchema: z.object({ tone: z.string().optional() }).strict(),
    });
    const id = editor.insertBlock({
      type: "strict",
      props: { tone: "info" },
      children: [{ type: "paragraph", content: "Child" }],
    });

    editor.setBlockCollapsed(id, true);
    expect(editor.getBlock(id)?.props).toEqual({ tone: "info", [BLOCK_COLLAPSED_PROP]: true });
    expect(() => editor.setBlockProp(id, BLOCK_COLLAPSED_PROP, "yes")).toThrow("must be a boolean");

    editor.setBlockType(id, "heading2");
    expect(editor.getBlock(id)?.props).toEqual({ [BLOCK_COLLAPSED_PROP]: true });
    expect(editor.getBlockCollapsed(id)).toBe(true);
    editor.destroy();
  });

  it("collapses several parents atomically, ignores leaves, and undoes once", () => {
    const editor = createRivtoEditor();
    const first = editor.insertBlock({
      type: "paragraph",
      content: "First",
      children: [{ type: "paragraph", content: "First child" }],
    });
    const leaf = editor.insertBlock({ type: "paragraph", content: "Leaf" }, first);
    const second = editor.insertBlock({
      type: "paragraph",
      content: "Second",
      children: [{ type: "paragraph", content: "Second child" }],
    }, leaf);
    const updates = jest.fn();
    const unsubscribe = editor.document.subscribe(updates);

    editor.setBlocksCollapsed([first, leaf, second, first], true);

    expect(updates).toHaveBeenCalledTimes(1);
    expect(editor.getBlockCollapsed(first)).toBe(true);
    expect(editor.getBlockCollapsed(second)).toBe(true);
    expect(editor.getBlock(leaf)?.props).toEqual({});

    editor.undo();
    expect(editor.getBlockCollapsed(first)).toBe(false);
    expect(editor.getBlockCollapsed(second)).toBe(false);
    unsubscribe();
    editor.destroy();
  });

  it("synchronizes collapse state through the CRDT document", () => {
    const leftDocument = new YjsDoc("collapse-left");
    const rightDocument = new YjsDoc("collapse-right");
    const left = createRivtoEditor({ document: leftDocument });
    const right = createRivtoEditor({ document: rightDocument });
    const parent = left.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Child" }],
    });
    Y.applyUpdate(rightDocument.doc, Y.encodeStateAsUpdate(leftDocument.doc));

    left.setBlocksCollapsed(parent, true);
    Y.applyUpdate(rightDocument.doc, Y.encodeStateAsUpdate(leftDocument.doc));

    expect(right.getBlockCollapsed(parent)).toBe(true);
    left.destroy();
    right.destroy();
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

  it("indents consecutive selected roots as one group without moving descendants twice", () => {
    const editor = createRivtoEditor();
    const previousId = editor.insertBlock({ type: "paragraph", content: "Previous" });
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" }, previousId);
    const childId = editor.insertBlock({ type: "paragraph", content: "Child" }, firstId);
    editor.indentBlock(childId);
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    editor.execute("selection.set", {
      selection: [{
        type: "block",
        blockIds: [firstId, childId, secondId],
        anchorBlockId: firstId,
        focusBlockId: secondId,
      }],
    });

    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);
    editor.indentBlock(firstId);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.getBlocks()).toMatchObject([{
      id: previousId,
      children: [
        { id: firstId, children: [{ id: childId }] },
        { id: secondId },
      ],
    }]);
    editor.undo();
    expect(editor.getBlocks()).toMatchObject([
      { id: previousId },
      { id: firstId, children: [{ id: childId }] },
      { id: secondId },
    ]);
    unsubscribe();
    editor.destroy();
  });

  it("does not partially indent a non-consecutive selection", () => {
    const editor = createRivtoEditor();
    const previousId = editor.insertBlock({ type: "paragraph", content: "Previous" });
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" }, previousId);
    const gapId = editor.insertBlock({ type: "paragraph", content: "Gap" }, firstId);
    const lastId = editor.insertBlock({ type: "paragraph", content: "Last" }, gapId);
    editor.execute("selection.set", {
      selection: [{
        type: "block",
        blockIds: [firstId, lastId],
        anchorBlockId: firstId,
        focusBlockId: lastId,
      }],
    });
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.indentBlock(firstId);

    expect(documentUpdates).not.toHaveBeenCalled();
    expect(editor.getBlocks().map((block) => block.id)).toEqual([previousId, firstId, gapId, lastId]);
    unsubscribe();
    editor.destroy();
  });

  it("rejects moving a block into its own subtree", () => {
    const editor = createRivtoEditor();
    const parentId = editor.insertBlock({ type: "paragraph", content: "Parent" });
    const childId = editor.insertBlock({ type: "paragraph", content: "Child" }, parentId);
    editor.indentBlock(childId);

    expect(() => editor.moveBlock(parentId, childId)).toThrow("relative to its descendant");
    expect(editor.getBlocks()).toMatchObject([{
      id: parentId,
      children: [{ id: childId }],
    }]);
    editor.destroy();
  });

  it("moves one block with its nested subtree in one undoable update", () => {
    const editor = createRivtoEditor();
    const parentId = editor.insertBlock({ type: "paragraph", content: "Parent" });
    const childId = editor.insertBlock({ type: "paragraph", content: "Child" }, parentId);
    editor.indentBlock(childId);
    const targetId = editor.insertBlock({ type: "paragraph", content: "Target" }, parentId);
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.moveBlock(parentId, targetId);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.getBlocks()).toMatchObject([
      { id: targetId },
      { id: parentId, children: [{ id: childId }] },
    ]);
    editor.undo();
    expect(editor.getBlocks()).toMatchObject([
      { id: parentId, children: [{ id: childId }] },
      { id: targetId },
    ]);
    unsubscribe();
    editor.destroy();
  });

  it("moves sibling roots in source order as one undoable update", () => {
    const editor = createRivtoEditor();
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" });
    const gapId = editor.insertBlock({ type: "paragraph", content: "Gap" }, firstId);
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, gapId);
    const targetId = editor.insertBlock({ type: "paragraph", content: "Target" }, secondId);
    const childId = editor.insertBlock({ type: "paragraph", content: "Child" }, firstId);
    editor.indentBlock(childId);
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.moveBlocks([secondId, childId, firstId], targetId, "after");

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.getBlocks().map((block) => block.id)).toEqual([gapId, targetId, firstId, secondId]);
    expect(editor.getBlock(firstId)?.children).toMatchObject([{ id: childId }]);
    editor.undo();
    expect(editor.getBlocks().map((block) => block.id)).toEqual([firstId, gapId, secondId, targetId]);
    unsubscribe();
    editor.destroy();
  });

  it("rejects grouped moves whose roots have different parents", () => {
    const editor = createRivtoEditor();
    const parentId = editor.insertBlock({ type: "paragraph", content: "Parent" });
    const childId = editor.insertBlock({ type: "paragraph", content: "Child" }, parentId);
    editor.indentBlock(childId);
    const siblingId = editor.insertBlock({ type: "paragraph", content: "Sibling" }, parentId);

    expect(() => editor.moveBlocks([childId, siblingId], parentId, "before")).toThrow("share the same parent");
    expect(editor.getBlocks()).toMatchObject([
      { id: parentId, children: [{ id: childId }] },
      { id: siblingId },
    ]);
    editor.destroy();
  });

  it("moves a block before a nested sibling", () => {
    const editor = createRivtoEditor();
    const parentId = editor.insertBlock({ type: "paragraph", content: "Parent" });
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" }, parentId);
    editor.indentBlock(firstId);
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    const movedId = editor.insertBlock({ type: "paragraph", content: "Moved" }, parentId);

    editor.moveBlock(movedId, secondId, "before");

    expect(editor.getBlocks()).toMatchObject([{
      id: parentId,
      children: [{ id: firstId }, { id: movedId }, { id: secondId }],
    }]);
    editor.destroy();
  });

  it("moves a block inside another block as its last child", () => {
    const editor = createRivtoEditor();
    const parentId = editor.insertBlock({ type: "paragraph", content: "Parent" });
    const existingChildId = editor.insertBlock({ type: "paragraph", content: "Existing" }, parentId);
    editor.indentBlock(existingChildId);
    const movedId = editor.insertBlock({ type: "paragraph", content: "Moved" }, parentId);

    editor.moveBlock(movedId, parentId, "inside");

    expect(editor.getBlocks()).toMatchObject([{
      id: parentId,
      children: [{ id: existingChildId }, { id: movedId }],
    }]);
    editor.destroy();
  });

  it("outdents consecutive selected roots as one group and adopts their following siblings", () => {
    const editor = createRivtoEditor();
    const parentId = editor.insertBlock({ type: "paragraph", content: "Parent" });
    const beforeId = editor.insertBlock({ type: "paragraph", content: "Before" }, parentId);
    editor.indentBlock(beforeId);
    const firstId = editor.insertBlock({ type: "paragraph", content: "First" }, beforeId);
    const existingChildId = editor.insertBlock({ type: "paragraph", content: "Existing child" }, firstId);
    editor.indentBlock(existingChildId);
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    const followingId = editor.insertBlock({ type: "paragraph", content: "Following" }, secondId);
    editor.execute("selection.set", {
      selection: [{
        type: "block",
        blockIds: [firstId, existingChildId, secondId],
        anchorBlockId: firstId,
        focusBlockId: secondId,
      }],
    });

    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);
    editor.outdentBlock(firstId);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.getBlocks()).toMatchObject([
      { id: parentId, children: [{ id: beforeId }] },
      { id: firstId, children: [{ id: existingChildId }] },
      { id: secondId, children: [{ id: followingId }] },
    ]);
    editor.undo();
    expect(editor.getBlocks()).toMatchObject([{
      id: parentId,
      children: [
        { id: beforeId },
        { id: firstId, children: [{ id: existingChildId }] },
        { id: secondId },
        { id: followingId },
      ],
    }]);
    unsubscribe();
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
