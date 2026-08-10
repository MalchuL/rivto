import * as Y from "yjs";
import { z } from "zod";
import { YjsDoc } from "../../store/crdt-doc";
import { createTestEditor as createRivtoEditor } from "../test-utils";

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

    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);

    editor.blocks.setBlockProp(firstId, "tone", "info");
    editor.blocks.indentBlock(secondId);

    expect(editor.blocks.getBlocks()).toMatchObject([
      {
        id: firstId,
        props: { tone: "info" },
        children: [{ id: secondId, content: "Second" }],
      },
    ]);

    editor.blocks.removeBlock(firstId);

    expect(editor.blocks.getBlocks()).toEqual([]);
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
    editor.blocksRegistry.defineBlock({ type: "heading2" });
    const id = editor.blocks.insertBlock({
      type: "paragraph",
      props: { old: true },
      pluginData: { demo: { pinned: true } },
      content: "Title",
      children: [{ type: "paragraph", content: "Child" }],
    });

    editor.blocks.setBlockType(id, "heading2");

    expect(editor.blocks.getBlock(id)).toMatchObject({
      id,
      type: "heading2",
      props: { old: true },
      pluginData: { demo: { pinned: true } },
      content: "Title",
      children: [{ content: "Child" }],
    });
    editor.undo();
    expect(editor.blocks.getBlock(id)).toMatchObject({ type: "paragraph", props: { old: true } });
    expect(() => editor.blocks.setBlockType(id, "missing")).toThrow("Unknown block type missing");
    editor.destroy();
  });

  it("merges and repairs destination properties when changing type", () => {
    const editor = createRivtoEditor();
    editor.blocksRegistry.defineBlock({
      type: "card",
      defaultProps: {
        count: 1,
        title: "Untitled",
        style: { color: "black", size: 12 },
      },
      propSchema: z.object({
        count: z.number().int().nonnegative(),
        title: z.string(),
        style: z.object({ color: z.string(), size: z.number() }),
        required: z.string(),
      }).strict(),
    });
    const id = editor.blocks.insertBlock({
      type: "paragraph",
      props: {
        count: "invalid",
        title: "Preserved",
        style: { color: "purple", size: "invalid" },
        required: "Present",
        extensionValue: { enabled: true },
      },
    });
    editor.history.clear();

    editor.blocks.setBlockType(id, "card");
    expect(editor.blocks.getBlock(id)?.props).toEqual({
      count: 1,
      title: "Preserved",
      style: { color: "black", size: 12 },
      required: "Present",
      extensionValue: { enabled: true },
    });
    editor.undo();
    expect(editor.blocks.getBlock(id)).toMatchObject({
      type: "paragraph",
      props: { count: "invalid", title: "Preserved", required: "Present" },
    });
    editor.redo();
    expect(editor.blocks.getBlock(id)).toMatchObject({ type: "card", props: { count: 1 } });

    const failing = editor.blocks.insertBlock({ type: "paragraph", props: { required: 3 } });
    expect(() => editor.blocks.setBlockType(failing, "card")).toThrow();
    expect(editor.blocks.getBlock(failing)).toMatchObject({ type: "paragraph", props: { required: 3 } });
    editor.destroy();
  });

  it("clears block content and descendants without losing block-owned data", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({
      type: "paragraph",
      collapsed: true,
      props: { tone: "info" },
      pluginData: { test: { pinned: true } },
      content: "Parent",
      children: [{
        type: "paragraph",
        content: "Child",
        children: [{ type: "paragraph", content: "Grandchild" }],
      }],
    });
    const childId = editor.blocks.getChildIds(id)[0]!;
    const outsideId = editor.blocks.insertBlock({ type: "paragraph", content: "Outside" }, id);
    editor.links.createLink({ id: "child-outside", from: { blockId: childId }, to: { blockId: outsideId } });
    editor.history.clear();

    expectOneUpdate(editor, () => editor.blocks.clearBlock(id));

    expect(editor.blocks.getBlock(id)).toMatchObject({
      id,
      type: "paragraph",
      collapsed: true,
      props: { tone: "info" },
      pluginData: { test: { pinned: true } },
      content: "",
      children: [],
    });
    expect(editor.blocks.getBlock(childId)).toBeUndefined();
    expect(editor.links.getLinks()).toEqual([]);

    editor.undo();
    expect(editor.blocks.getBlock(id)).toMatchObject({
      content: "Parent",
      children: [{ id: childId, children: [{ content: "Grandchild" }] }],
    });
    expect(editor.links.getLinks()).toMatchObject([{ id: "child-outside" }]);
    editor.redo();
    expect(editor.blocks.getBlock(id)).toMatchObject({ content: "", children: [] });
    editor.destroy();
  });

  it("batches several block clears into one update and undo step", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "First",
      children: [{ type: "paragraph", content: "First child" }],
    });
    const second = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Second",
      children: [{ type: "paragraph", content: "Second child" }],
    }, first);
    editor.history.clear();

    expectOneUpdate(editor, () => {
      editor.batchUpdates(() => {
        editor.blocks.clearBlock(first);
        editor.blocks.clearBlock(second);
      });
    });
    expect(editor.blocks.getBlock(first)).toMatchObject({ content: "", children: [] });
    expect(editor.blocks.getBlock(second)).toMatchObject({ content: "", children: [] });

    editor.undo();
    expect(editor.blocks.getBlock(first)).toMatchObject({
      content: "First",
      children: [{ content: "First child" }],
    });
    expect(editor.blocks.getBlock(second)).toMatchObject({
      content: "Second",
      children: [{ content: "Second child" }],
    });
    editor.destroy();
  });

  it("validates and preserves top-level collapse state across block types", () => {
    const editor = createRivtoEditor();
    editor.blocksRegistry.defineBlock({ type: "heading2" });
    editor.blocksRegistry.defineBlock({
      type: "strict",
      propSchema: z.object({ tone: z.string().optional() }).strict(),
    });
    const id = editor.blocks.insertBlock({
      type: "strict",
      props: { tone: "info" },
      children: [{ type: "paragraph", content: "Child" }],
    });
    const initiallyCollapsed = editor.blocks.insertBlock({
      type: "paragraph",
      collapsed: true,
      children: [{ type: "paragraph" }],
    }, id);

    expect(editor.blocks.getBlock(id)?.collapsed).toBe(false);
    expect(editor.blocks.getBlock(initiallyCollapsed)?.collapsed).toBe(true);
    editor.blocks.updateBlock(id, { collapsed: true });
    expect(editor.blocks.getBlock(id)).toMatchObject({
      collapsed: true,
      props: { tone: "info" },
    });
    expect(() => editor.execute("block.update", {
      id,
      patch: { collapsed: "yes" },
    })).toThrow("block.collapsed must be a boolean");
    expect(editor.blocks.getBlock(id)?.collapsed).toBe(true);

    editor.blocks.setBlockType(id, "heading2");
    expect(editor.blocks.getBlock(id)?.props).toEqual({ tone: "info" });
    expect(editor.blocks.getBlock(id)?.collapsed).toBe(true);
    editor.destroy();
  });

  it("defaults, validates, and undoes first-class list state atomically", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph" });
    const second = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { type: "checkbox", checked: true },
    }, first);

    expect(editor.blocks.getBlock(first)?.listProps).toEqual({ type: "list", checked: false });
    expect(editor.blocks.getBlock(second)?.listProps).toEqual({ type: "checkbox", checked: true });

    editor.blocks.updateBlocks([
      { id: first, patch: { listProps: { type: "start_numbered_list" } } },
      { id: second, patch: { listProps: { checked: false } } },
    ]);
    expect(editor.blocks.getBlock(first)?.listProps.type).toBe("start_numbered_list");
    expect(editor.blocks.getBlock(second)?.listProps.checked).toBe(false);

    expect(() => editor.execute("block.update-many", { updates: [
      { id: first, patch: { listProps: { type: "list" } } },
      { id: second, patch: { listProps: { checked: "yes" } } },
    ] })).toThrow("block.listProps.checked must be a boolean");
    expect(editor.blocks.getBlock(first)?.listProps.type).toBe("start_numbered_list");

    expect(() => editor.execute("block.update", {
      id: first,
      patch: { listProps: { type: "ordered" } },
    })).toThrow("block.listProps.type must be a supported list type");
    expect(editor.blocks.getBlock(first)?.listProps.type).toBe("start_numbered_list");

    editor.undo();
    expect(editor.blocks.getBlock(first)?.listProps.type).toBe("list");
    expect(editor.blocks.getBlock(second)?.listProps.checked).toBe(true);
    editor.redo();
    expect(editor.blocks.getBlock(first)?.listProps.type).toBe("start_numbered_list");
    expect(editor.blocks.getBlock(second)?.listProps.checked).toBe(false);
    editor.destroy();
  });

  it("updates several blocks atomically in supplied order and undoes once", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "First",
      children: [{ type: "paragraph", content: "First child" }],
    });
    const leaf = editor.blocks.insertBlock({ type: "paragraph", content: "Leaf" }, first);
    const second = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Second",
      children: [{ type: "paragraph", content: "Second child" }],
    }, leaf);
    const updates = jest.fn();
    const unsubscribe = editor.document.subscribe(updates);

    editor.blocks.updateBlocks([
      { id: first, patch: { collapsed: true, props: { order: "first" } } },
      { id: leaf, patch: { collapsed: true } },
      { id: second, patch: { collapsed: true } },
      { id: first, patch: { props: { order: "last" } } },
    ]);

    expect(updates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlock(first)).toMatchObject({ collapsed: true, props: { order: "last" } });
    expect(editor.blocks.getBlock(second)?.collapsed).toBe(true);
    expect(editor.blocks.getBlock(leaf)?.collapsed).toBe(true);
    expect(() => editor.blocks.updateBlocks([
      { id: first, patch: { collapsed: false } },
      { id: "missing", patch: { collapsed: true } },
    ])).toThrow("Block missing not found");
    expect(editor.blocks.getBlock(first)?.collapsed).toBe(true);
    expect(updates).toHaveBeenCalledTimes(1);

    editor.undo();
    expect(editor.blocks.getBlock(first)).toMatchObject({ collapsed: false, props: {} });
    expect(editor.blocks.getBlock(second)?.collapsed).toBe(false);
    expect(editor.blocks.getBlock(leaf)?.collapsed).toBe(false);
    unsubscribe();
    editor.destroy();
  });

  it("synchronizes collapse state through the CRDT document", () => {
    const leftDocument = new YjsDoc("collapse-left");
    const rightDocument = new YjsDoc("collapse-right");
    const left = createRivtoEditor({ document: leftDocument });
    const right = createRivtoEditor({ document: rightDocument });
    const parent = left.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Child" }],
    });
    Y.applyUpdate(rightDocument.doc, Y.encodeStateAsUpdate(leftDocument.doc));

    left.blocks.updateBlocks([{ id: parent, patch: { collapsed: true } }]);
    Y.applyUpdate(rightDocument.doc, Y.encodeStateAsUpdate(leftDocument.doc));

    expect(right.blocks.getBlock(parent)?.collapsed).toBe(true);
    left.destroy();
    right.destroy();
  });

  it("notifies subscribers once for every successful block command", () => {
    const editor = createRivtoEditor();
    let firstId = "";
    let secondId = "";

    expectOneUpdate(editor, () => {
      firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    });
    expectOneUpdate(editor, () => {
      secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    });
    expectOneUpdate(editor, () => {
      editor.blocks.updateBlock(firstId, { content: "First updated" });
    });
    expectOneUpdate(editor, () => {
      editor.blocks.setBlockProp(firstId, "tone", "info");
    });
    expectOneUpdate(editor, () => {
      editor.blocks.setBlockPluginData(firstId, "test", { seen: true });
    });
    expectOneUpdate(editor, () => {
      editor.blocks.indentBlock(secondId);
    });
    expectOneUpdate(editor, () => {
      editor.blocks.outdentBlock(secondId);
    });
    expectOneUpdate(editor, () => {
      editor.blocks.moveBlock(secondId, null);
    });
    expectOneUpdate(editor, () => {
      editor.blocks.removeBlock(secondId);
    });

    editor.destroy();
  });

  it("outdents once and adopts every following sibling after existing children", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" });
    const beforeId = editor.blocks.insertBlock({ type: "paragraph", content: "Before" }, parentId);
    editor.blocks.indentBlock(beforeId);
    const currentId = editor.blocks.insertBlock({ type: "paragraph", content: "Current" }, beforeId);
    const existingChildId = editor.blocks.insertBlock({ type: "paragraph", content: "Existing child" }, currentId);
    editor.blocks.indentBlock(existingChildId);
    const followingId = editor.blocks.insertBlock({ type: "paragraph", content: "Following" }, currentId);
    const lastId = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, followingId);

    expectOneUpdate(editor, () => editor.blocks.outdentBlock(currentId));

    expect(editor.blocks.getBlocks()).toMatchObject([
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
    expect(editor.blocks.getBlocks()).toMatchObject([{
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
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" });
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, previousId);
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, firstId);
    editor.blocks.indentBlock(childId);
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
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
    editor.blocks.indentBlock(firstId);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: previousId,
      children: [
        { id: firstId, children: [{ id: childId }] },
        { id: secondId },
      ],
    }]);
    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: previousId },
      { id: firstId, children: [{ id: childId }] },
      { id: secondId },
    ]);
    unsubscribe();
    editor.destroy();
  });

  it("does not partially indent a non-consecutive selection", () => {
    const editor = createRivtoEditor();
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" });
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, previousId);
    const gapId = editor.blocks.insertBlock({ type: "paragraph", content: "Gap" }, firstId);
    const lastId = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, gapId);
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

    editor.blocks.indentBlock(firstId);

    expect(documentUpdates).not.toHaveBeenCalled();
    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([previousId, firstId, gapId, lastId]);
    unsubscribe();
    editor.destroy();
  });

  it("rejects moving a block into its own subtree", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" });
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, parentId);
    editor.blocks.indentBlock(childId);

    expect(() => editor.blocks.moveBlock(parentId, childId)).toThrow("relative to its descendant");
    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: parentId,
      children: [{ id: childId }],
    }]);
    editor.destroy();
  });

  it("moves one block with its nested subtree in one undoable update", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" });
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, parentId);
    editor.blocks.indentBlock(childId);
    const targetId = editor.blocks.insertBlock({ type: "paragraph", content: "Target" }, parentId);
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.blocks.moveBlock(parentId, targetId);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: targetId },
      { id: parentId, children: [{ id: childId }] },
    ]);
    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: parentId, children: [{ id: childId }] },
      { id: targetId },
    ]);
    unsubscribe();
    editor.destroy();
  });

  it("moves sibling roots in source order as one undoable update", () => {
    const editor = createRivtoEditor();
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const gapId = editor.blocks.insertBlock({ type: "paragraph", content: "Gap" }, firstId);
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, gapId);
    const targetId = editor.blocks.insertBlock({ type: "paragraph", content: "Target" }, secondId);
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, firstId);
    editor.blocks.indentBlock(childId);
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.blocks.moveBlocks([secondId, childId, firstId], targetId, "after");

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([gapId, targetId, firstId, secondId]);
    expect(editor.blocks.getBlock(firstId)?.children).toMatchObject([{ id: childId }]);
    editor.undo();
    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([firstId, gapId, secondId, targetId]);
    unsubscribe();
    editor.destroy();
  });

  it("rejects grouped moves whose roots have different parents", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" });
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, parentId);
    editor.blocks.indentBlock(childId);
    const siblingId = editor.blocks.insertBlock({ type: "paragraph", content: "Sibling" }, parentId);

    expect(() => editor.blocks.moveBlocks([childId, siblingId], parentId, "before")).toThrow("share the same parent");
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: parentId, children: [{ id: childId }] },
      { id: siblingId },
    ]);
    editor.destroy();
  });

  it("moves a block before a nested sibling", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" });
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, parentId);
    editor.blocks.indentBlock(firstId);
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    const movedId = editor.blocks.insertBlock({ type: "paragraph", content: "Moved" }, parentId);

    editor.blocks.moveBlock(movedId, secondId, "before");

    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: parentId,
      children: [{ id: firstId }, { id: movedId }, { id: secondId }],
    }]);
    editor.destroy();
  });

  it("moves a block inside another block as its last child", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" });
    const existingChildId = editor.blocks.insertBlock({ type: "paragraph", content: "Existing" }, parentId);
    editor.blocks.indentBlock(existingChildId);
    const movedId = editor.blocks.insertBlock({ type: "paragraph", content: "Moved" }, parentId);

    editor.blocks.moveBlock(movedId, parentId, "inside");

    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: parentId,
      children: [{ id: existingChildId }, { id: movedId }],
    }]);
    editor.destroy();
  });

  it("outdents consecutive selected roots as one group and adopts their following siblings", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" });
    const beforeId = editor.blocks.insertBlock({ type: "paragraph", content: "Before" }, parentId);
    editor.blocks.indentBlock(beforeId);
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, beforeId);
    const existingChildId = editor.blocks.insertBlock({ type: "paragraph", content: "Existing child" }, firstId);
    editor.blocks.indentBlock(existingChildId);
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    const followingId = editor.blocks.insertBlock({ type: "paragraph", content: "Following" }, secondId);
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
    editor.blocks.outdentBlock(firstId);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: parentId, children: [{ id: beforeId }] },
      { id: firstId, children: [{ id: existingChildId }] },
      { id: secondId, children: [{ id: followingId }] },
    ]);
    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{
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
    const targetId = editor.blocks.insertBlock({ type: "paragraph", content: "Before" });
    const targetChildId = editor.blocks.insertBlock({ type: "paragraph", content: "Target child" }, targetId);
    editor.blocks.indentBlock(targetChildId);
    const sourceId = editor.blocks.insertBlock({ type: "paragraph", content: "After" }, targetId);
    const sourceChildId = editor.blocks.insertBlock({ type: "paragraph", content: "Source child" }, sourceId);
    editor.blocks.indentBlock(sourceChildId);
    let joinOffset = -1;

    expectOneUpdate(editor, () => {
      joinOffset = editor.blocks.mergeBlocks(targetId, sourceId);
    });

    expect(joinOffset).toBe("Before".length);
    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: targetId,
      content: "BeforeAfter",
      children: [{ id: targetChildId }, { id: sourceChildId }],
    }]);
    expect(editor.blocks.getBlock(sourceId)).toBeUndefined();

    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([
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
    editor.blocks.insertBlock({ type: "paragraph" });

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
    const sourceId = editor.blocks.insertBlock({ type: "paragraph", content: "Source" });
    const targetId = editor.blocks.insertBlock({ type: "paragraph", content: "Target" }, sourceId);

    editor.links.createLink({ id: "source-target", from: { blockId: sourceId }, to: { blockId: targetId } });

    expect(editor.dump()).toMatchObject({
      version: 5,
      blocks: [{ id: sourceId }, { id: targetId }],
      links: [{ id: "source-target", from: { blockId: sourceId }, to: { blockId: targetId } }],
    });

    editor.links.removeLink("source-target");
    expect(editor.dump().links).toEqual([]);

    editor.load({
      version: 5,
      blocks: [{
        id: "loaded",
        type: "paragraph",
        collapsed: false,
        listProps: { type: "list", checked: false },
        props: {},
        pluginData: {},
        content: "Loaded",
        children: [],
      }],
      links: [],
    });

    expect(editor.blocks.getBlocks()).toMatchObject([{ id: "loaded", content: "Loaded" }]);
    expect(() => editor.execute("document.load", {
      snapshot: { version: 3, blocks: [], links: [] },
    })).not.toThrow();
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(() => editor.execute("document.load", {
      snapshot: {
        version: 5,
        blocks: [{
          id: "invalid",
          type: "paragraph",
          props: {},
          pluginData: {},
          content: "",
          children: [],
        }],
        links: [],
      },
    })).toThrow("block.collapsed must be a boolean");
    editor.destroy();
  });
});
