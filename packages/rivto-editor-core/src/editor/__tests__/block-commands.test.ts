import * as Y from "yjs";
import { z } from "zod";
import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "@chulane/document-model";
import { createTestEditor as createRivtoEditor } from "../test-utils";

describe("EditorRuntime block manager", () => {
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

    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId).id;

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

    editor.commands.register("test.echo", (payload) => payload);

    expect(editor.commands.execute("test.echo", "ok")).toBe("ok");

    editor.commands.remove("test.echo");

    expect(() => editor.commands.execute("test.echo")).toThrow("Unknown command test.echo");
    editor.destroy();
  });

  it("converts a block without losing identity or nested data", () => {
    const editor = createRivtoEditor();
    editor.blockRegistry.defineBlock({ type: "heading2" });
    const id = editor.blocks.insertBlock({
      type: "paragraph",
      props: { old: true },
      pluginData: { demo: { pinned: true } },
      content: "Title",
      children: [{ type: "paragraph", content: "Child" }],
    }).id;

    editor.blocks.setBlockType(id, "heading2");

    expect(editor.blocks.getBlock(id)).toMatchObject({
      id,
      type: "heading2",
      props: { old: true },
      pluginData: { demo: { pinned: true } },
      content: "Title",
      children: [{ content: "Child" }],
    });
    editor.history.undo();
    expect(editor.blocks.getBlock(id)).toMatchObject({ type: "paragraph", props: { old: true } });
    expect(() => editor.blocks.setBlockType(id, "missing")).toThrow("Unknown block type missing");
    editor.destroy();
  });

  it("merges and repairs destination properties when changing type", () => {
    const editor = createRivtoEditor();
    editor.blockRegistry.defineBlock({
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
    }).id;
    editor.history.clear();

    editor.blocks.setBlockType(id, "card");
    expect(editor.blocks.getBlock(id)?.props).toEqual({
      count: 1,
      title: "Preserved",
      style: { color: "black", size: 12 },
      required: "Present",
      extensionValue: { enabled: true },
    });
    editor.history.undo();
    expect(editor.blocks.getBlock(id)).toMatchObject({
      type: "paragraph",
      props: { count: "invalid", title: "Preserved", required: "Present" },
    });
    editor.history.redo();
    expect(editor.blocks.getBlock(id)).toMatchObject({ type: "card", props: { count: 1 } });

    const failing = editor.blocks.insertBlock({ type: "paragraph", props: { required: 3 } }).id;
    expect(() => editor.blocks.setBlockType(failing, "card")).toThrow();
    expect(editor.blocks.getBlock(failing)).toMatchObject({ type: "paragraph", props: { required: 3 } });
    editor.destroy();
  });

  it("evaluates dynamic defaults once per creation and conversion", () => {
    const editor = createRivtoEditor();
    let sequence = 0;
    editor.blockRegistry.defineBlock({
      type: "dynamic",
      defaultProps: () => ({ sequence: ++sequence, repaired: sequence }),
      propSchema: z.object({ sequence: z.number(), repaired: z.number() }),
    });

    const first = editor.blocks.insertBlock({ type: "dynamic" }).id;
    const second = editor.blocks.insertBlock({ type: "dynamic" }).id;
    const converted = editor.blocks.insertBlock({ type: "paragraph", props: { repaired: "invalid", extra: true } }).id;
    editor.blocks.setBlockType(converted, "dynamic");

    expect(editor.blocks.getBlock(first)?.props).toEqual({ sequence: 1, repaired: 1 });
    expect(editor.blocks.getBlock(second)?.props).toEqual({ sequence: 2, repaired: 2 });
    expect(editor.blocks.getBlock(converted)?.props).toEqual({ sequence: 3, repaired: 3, extra: true });
    expect(sequence).toBe(3);
    editor.destroy();
  });

  it("clears block content and descendants without losing block-owned data", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { collapsed: true },
      props: { tone: "info" },
      pluginData: { test: { pinned: true } },
      content: "Parent",
      children: [{
        type: "paragraph",
        content: "Child",
        children: [{ type: "paragraph", content: "Grandchild" }],
      }],
    }).id;
    const childId = editor.blocks.getChildIds(id)[0]!;
    const outsideId = editor.blocks.insertBlock({ type: "paragraph", content: "Outside" }, id).id;
    editor.history.clear();

    expectOneUpdate(editor, () => editor.blocks.clearBlock(id));

    expect(editor.blocks.getBlock(id)).toMatchObject({
      id,
      type: "paragraph",
      listProps: { collapsed: true },
      props: { tone: "info" },
      pluginData: { test: { pinned: true } },
      content: "",
      children: [],
    });
    expect(editor.blocks.getBlock(childId)).toBeUndefined();
    expect(editor.blocks.getBlock(outsideId)?.content).toBe("Outside");

    editor.history.undo();
    expect(editor.blocks.getBlock(id)).toMatchObject({
      content: "Parent",
      children: [{ id: childId, children: [{ content: "Grandchild" }] }],
    });
    editor.history.redo();
    expect(editor.blocks.getBlock(id)).toMatchObject({ content: "", children: [] });
    editor.destroy();
  });

  it("batches several block clears into one update and undo step", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "First",
      children: [{ type: "paragraph", content: "First child" }],
    }).id;
    const second = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Second",
      children: [{ type: "paragraph", content: "Second child" }],
    }, first).id;
    editor.history.clear();

    expectOneUpdate(editor, () => {
      editor.history.batchUpdates(() => {
        editor.blocks.clearBlock(first);
        editor.blocks.clearBlock(second);
      });
    });
    expect(editor.blocks.getBlock(first)).toMatchObject({ content: "", children: [] });
    expect(editor.blocks.getBlock(second)).toMatchObject({ content: "", children: [] });

    editor.history.undo();
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

  it("preserves opaque list properties across block types", () => {
    const editor = createRivtoEditor();
    editor.blockRegistry.defineBlock({ type: "heading2" });
    editor.blockRegistry.defineBlock({
      type: "strict",
      propSchema: z.object({ tone: z.string().optional() }).strict(),
    });
    const id = editor.blocks.insertBlock({
      type: "strict",
      props: { tone: "info" },
      children: [{ type: "paragraph", content: "Child" }],
    }).id;
    const initiallyCollapsed = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { collapsed: true },
      children: [{ type: "paragraph" }],
    }, id).id;

    expect(editor.blocks.getBlock(id)?.listProps.collapsed).toBeUndefined();
    expect(editor.blocks.getBlock(initiallyCollapsed)?.listProps.collapsed).toBe(true);
    editor.blocks.updateBlock(id, { listProps: { collapsed: true } });
    expect(editor.blocks.getBlock(id)).toMatchObject({
      listProps: { collapsed: true },
      props: { tone: "info" },
    });
    editor.blocks.updateBlock(id, { listProps: { collapsed: "yes" } });
    expect(editor.blocks.getBlock(id)?.listProps.collapsed).toBe("yes");
    editor.blocks.updateBlock(id, { listProps: { collapsed: true } });
    expect(editor.blocks.getBlock(id)?.listProps.collapsed).toBe(true);

    editor.blocks.setBlockType(id, "heading2");
    expect(editor.blocks.getBlock(id)?.props).toEqual({ tone: "info" });
    expect(editor.blocks.getBlock(id)?.listProps.collapsed).toBe(true);
    editor.destroy();
  });

  it("merges, portability-checks, and undoes opaque list state atomically", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const second = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { type: "checkbox", checked: true },
    }, first).id;

    expect(editor.blocks.getBlock(first)?.listProps).toEqual({});
    expect(editor.blocks.getBlock(second)?.listProps).toEqual({ type: "checkbox", checked: true });

    editor.blocks.updateBlocks([
      { id: first, patch: { listProps: { type: "start_numbered_list" } } },
      { id: second, patch: { listProps: { checked: false } } },
    ]);
    expect(editor.blocks.getBlock(first)?.listProps.type).toBe("start_numbered_list");
    expect(editor.blocks.getBlock(second)?.listProps.checked).toBe(false);

    expect(() => editor.blocks.updateBlocks([
      { id: first, patch: { listProps: { type: "list" } } },
      { id: second, patch: { listProps: { checked: Number.POSITIVE_INFINITY } } },
    ])).toThrow("block.listProps.checked must be a finite number");
    expect(editor.blocks.getBlock(first)?.listProps.type).toBe("start_numbered_list");

    editor.history.undo();
    expect(editor.blocks.getBlock(first)?.listProps.type).toBeUndefined();
    expect(editor.blocks.getBlock(second)?.listProps.checked).toBe(true);
    editor.history.redo();
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
    }).id;
    const leaf = editor.blocks.insertBlock({ type: "paragraph", content: "Leaf" }, first).id;
    const second = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Second",
      children: [{ type: "paragraph", content: "Second child" }],
    }, leaf).id;
    const updates = jest.fn();
    const unsubscribe = editor.subscribe(updates);

    editor.blocks.updateBlocks([
      { id: first, patch: { listProps: { collapsed: true }, props: { order: "first" } } },
      { id: leaf, patch: { listProps: { collapsed: true } } },
      { id: second, patch: { listProps: { collapsed: true } } },
      { id: first, patch: { props: { order: "last" } } },
    ]);

    expect(updates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlock(first)).toMatchObject({ listProps: { collapsed: true }, props: { order: "last" } });
    expect(editor.blocks.getBlock(second)?.listProps.collapsed).toBe(true);
    expect(editor.blocks.getBlock(leaf)?.listProps.collapsed).toBe(true);
    expect(() => editor.blocks.updateBlocks([
      { id: first, patch: { listProps: { collapsed: false } } },
      { id: "missing", patch: { listProps: { collapsed: true } } },
    ])).toThrow("Block missing not found");
    expect(editor.blocks.getBlock(first)?.listProps.collapsed).toBe(true);
    expect(updates).toHaveBeenCalledTimes(1);

    editor.history.undo();
    expect(editor.blocks.getBlock(first)).toMatchObject({ listProps: {}, props: {} });
    expect(editor.blocks.getBlock(second)?.listProps.collapsed).toBeUndefined();
    expect(editor.blocks.getBlock(leaf)?.listProps.collapsed).toBeUndefined();
    unsubscribe();
    editor.destroy();
  });

  it("synchronizes collapse state through the CRDT document", () => {
    const leftDocument = new YjsDoc("collapse-left");
    const rightDocument = new YjsDoc("collapse-right");
    const left = createRivtoEditor();
    const right = createRivtoEditor();
    left.setDocument(new DocumentModelImpl(leftDocument));
    right.setDocument(new DocumentModelImpl(rightDocument));
    const parent = left.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Child" }],
    }).id;
    Y.applyUpdate(rightDocument.doc, Y.encodeStateAsUpdate(leftDocument.doc));

    left.blocks.updateBlocks([{ id: parent, patch: { listProps: { collapsed: true } } }]);
    Y.applyUpdate(rightDocument.doc, Y.encodeStateAsUpdate(leftDocument.doc));

    expect(right.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);
    left.destroy();
    right.destroy();
  });

  it("notifies subscribers once for every successful block command", () => {
    const editor = createRivtoEditor();
    let firstId = "";
    let secondId = "";

    expectOneUpdate(editor, () => {
      firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    });
    expectOneUpdate(editor, () => {
      secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId).id;
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
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const beforeId = editor.blocks.insertBlock({ type: "paragraph", content: "Before" }, parentId).id;
    editor.blocks.indentBlock(beforeId);
    const currentId = editor.blocks.insertBlock({ type: "paragraph", content: "Current" }, beforeId).id;
    const existingChildId = editor.blocks.insertBlock({ type: "paragraph", content: "Existing child" }, currentId).id;
    editor.blocks.indentBlock(existingChildId);
    const followingId = editor.blocks.insertBlock({ type: "paragraph", content: "Following" }, currentId).id;
    const lastId = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, followingId).id;

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

    editor.history.undo();
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
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" }).id;
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, previousId).id;
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, firstId).id;
    editor.blocks.indentBlock(childId);
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId).id;

    const documentUpdates = jest.fn();
    const unsubscribe = editor.subscribe(documentUpdates);
    editor.blocks.indentBlocks([firstId, childId, secondId]);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: previousId,
      children: [
        { id: firstId, children: [{ id: childId }] },
        { id: secondId },
      ],
    }]);
    editor.history.undo();
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
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" }).id;
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, previousId).id;
    const gapId = editor.blocks.insertBlock({ type: "paragraph", content: "Gap" }, firstId).id;
    const lastId = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, gapId).id;
    const documentUpdates = jest.fn();
    const unsubscribe = editor.subscribe(documentUpdates);

    editor.blocks.indentBlocks([firstId, lastId]);

    expect(documentUpdates).not.toHaveBeenCalled();
    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([previousId, firstId, gapId, lastId]);
    unsubscribe();
    editor.destroy();
  });

  it("rejects moving a block into its own subtree", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, parentId).id;
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
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, parentId).id;
    editor.blocks.indentBlock(childId);
    const targetId = editor.blocks.insertBlock({ type: "paragraph", content: "Target" }, parentId).id;
    const documentUpdates = jest.fn();
    const unsubscribe = editor.subscribe(documentUpdates);

    editor.blocks.moveBlock(parentId, targetId);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: targetId },
      { id: parentId, children: [{ id: childId }] },
    ]);
    editor.history.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: parentId, children: [{ id: childId }] },
      { id: targetId },
    ]);
    unsubscribe();
    editor.destroy();
  });

  it("moves sibling roots in source order as one undoable update", () => {
    const editor = createRivtoEditor();
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const gapId = editor.blocks.insertBlock({ type: "paragraph", content: "Gap" }, firstId).id;
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, gapId).id;
    const targetId = editor.blocks.insertBlock({ type: "paragraph", content: "Target" }, secondId).id;
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, firstId).id;
    editor.blocks.indentBlock(childId);
    const documentUpdates = jest.fn();
    const unsubscribe = editor.subscribe(documentUpdates);

    editor.blocks.moveBlocks([secondId, childId, firstId], targetId, "after");

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([gapId, targetId, firstId, secondId]);
    expect(editor.blocks.getBlock(firstId)?.children).toMatchObject([{ id: childId }]);
    editor.history.undo();
    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([firstId, gapId, secondId, targetId]);
    unsubscribe();
    editor.destroy();
  });

  it("rejects grouped moves whose roots have different parents", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, parentId).id;
    editor.blocks.indentBlock(childId);
    const siblingId = editor.blocks.insertBlock({ type: "paragraph", content: "Sibling" }, parentId).id;

    expect(() => editor.blocks.moveBlocks([childId, siblingId], parentId, "before")).toThrow("share the same parent");
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: parentId, children: [{ id: childId }] },
      { id: siblingId },
    ]);
    editor.destroy();
  });

  it("moves a block before a nested sibling", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, parentId).id;
    editor.blocks.indentBlock(firstId);
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId).id;
    const movedId = editor.blocks.insertBlock({ type: "paragraph", content: "Moved" }, parentId).id;

    editor.blocks.moveBlock(movedId, secondId, "before");

    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: parentId,
      children: [{ id: firstId }, { id: movedId }, { id: secondId }],
    }]);
    editor.destroy();
  });

  it("moves a block inside another block as its last child", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const existingChildId = editor.blocks.insertBlock({ type: "paragraph", content: "Existing" }, parentId).id;
    editor.blocks.indentBlock(existingChildId);
    const movedId = editor.blocks.insertBlock({ type: "paragraph", content: "Moved" }, parentId).id;

    editor.blocks.moveBlock(movedId, parentId, "inside");

    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: parentId,
      children: [{ id: existingChildId }, { id: movedId }],
    }]);
    editor.destroy();
  });

  it("outdents consecutive selected roots as one group and adopts their following siblings", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const beforeId = editor.blocks.insertBlock({ type: "paragraph", content: "Before" }, parentId).id;
    editor.blocks.indentBlock(beforeId);
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, beforeId).id;
    const existingChildId = editor.blocks.insertBlock({ type: "paragraph", content: "Existing child" }, firstId).id;
    editor.blocks.indentBlock(existingChildId);
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId).id;
    const followingId = editor.blocks.insertBlock({ type: "paragraph", content: "Following" }, secondId).id;

    const documentUpdates = jest.fn();
    const unsubscribe = editor.subscribe(documentUpdates);
    editor.blocks.outdentBlocks([firstId, existingChildId, secondId]);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: parentId, children: [{ id: beforeId }] },
      { id: firstId, children: [{ id: existingChildId }] },
      { id: secondId, children: [{ id: followingId }] },
    ]);
    editor.history.undo();
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
    const targetId = editor.blocks.insertBlock({ type: "paragraph", content: "Before" }).id;
    const targetChildId = editor.blocks.insertBlock({ type: "paragraph", content: "Target child" }, targetId).id;
    editor.blocks.indentBlock(targetChildId);
    const sourceId = editor.blocks.insertBlock({ type: "paragraph", content: "After" }, targetId).id;
    const sourceChildId = editor.blocks.insertBlock({ type: "paragraph", content: "Source child" }, sourceId).id;
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

    editor.history.undo();
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

    expect(() => editor.blocks.insertBlock({ type: "missing" })).toThrow("unavailable");

    expect(listener).not.toHaveBeenCalled();
    expect(editor.revision).toBe(before);
    editor.destroy();
  });

  it("loads and dumps snapshots through editor methods", () => {
    const editor = createRivtoEditor();
    const sourceId = editor.blocks.insertBlock({ type: "paragraph", content: "Source" }).id;
    const targetId = editor.blocks.insertBlock({ type: "paragraph", content: "Target" }, sourceId).id;

    expect(editor.dump()).toMatchObject({
      version: 6,
      blocks: [{ id: sourceId }, { id: targetId }],
    });

    editor.load({
      version: 6,
      blocks: [{
        id: "loaded",
        type: "paragraph",
        listProps: { collapsed: false, type: "list", checked: false },
        props: {},
        pluginData: {},
        content: "Loaded",
        children: [],
      }],
    });

    expect(editor.blocks.getBlocks()).toMatchObject([{ id: "loaded", content: "Loaded" }]);
    expect(() => editor.load({ version: 3, blocks: [] } as never))
      .toThrow("Unsupported Rivto document snapshot version: 3");
    expect(editor.blocks.getBlocks()).toMatchObject([{ id: "loaded", content: "Loaded" }]);
    expect(() => editor.load({
      version: 6,
      blocks: [{
        id: "invalid",
        type: "paragraph",
        props: {},
        pluginData: {},
        content: "",
        children: [],
      }],
    } as never)).toThrow("block.listProps must be an object");
    editor.destroy();
  });
});
