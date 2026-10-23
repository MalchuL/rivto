import * as Y from "yjs";
import { z } from "zod";
import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "@chulane/document-model";
import { createTestEditor as createDocumentEditor } from "../test-utils";

describe("DocumentEditor block manager", () => {
  const expectOneUpdate = (
    editor: Awaited<ReturnType<typeof createDocumentEditor>>,
    action: () => void,
  ): void => {
    const calls: number[] = [];
    const unsubscribe = editor.subscribe(() => calls.push(editor.revision));
    const before = editor.revision;

    action();

    expect(calls).toHaveLength(1);
    expect(editor.revision).toBe(before + 1);
    expect(calls[0]).toBe(editor.revision);
    unsubscribe();
  };

  it("mutates blocks through registered commands", async () => {
    const editor = await createDocumentEditor();

    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const secondId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Second" },
      editor.blocks.getInsertionDestinationAfter(firstId),
    ).id;

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

  it("registers and removes runtime commands through the editor api", async () => {
    const editor = await createDocumentEditor();

    editor.commands.register("test.echo", (payload) => payload);

    expect(editor.commands.execute("test.echo", "ok")).toBe("ok");

    editor.commands.remove("test.echo");

    expect(() => editor.commands.execute("test.echo")).toThrow("Unknown command test.echo");
    editor.destroy();
  });

  it("converts a block without losing identity or nested data", async () => {
    const editor = await createDocumentEditor();
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
    expect(editor.blocks.getBlockNode(id)).toMatchObject({
      type: "paragraph",
      props: { old: true },
    });
    expect(() => editor.blocks.setBlockType(id, "missing")).toThrow("Unknown block type missing");
    editor.destroy();
  });

  it("merges and repairs destination properties when changing type", async () => {
    const editor = await createDocumentEditor();
    editor.blockRegistry.defineBlock({
      type: "card",
      defaultProps: {
        count: 1,
        title: "Untitled",
        style: { color: "black", size: 12 },
      },
      propSchema: z
        .object({
          count: z.number().int().nonnegative(),
          title: z.string(),
          style: z.object({ color: z.string(), size: z.number() }),
          required: z.string(),
        })
        .strict(),
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
    expect(editor.blocks.getBlockNode(id)?.props).toEqual({
      count: 1,
      title: "Preserved",
      style: { color: "black", size: 12 },
      required: "Present",
      extensionValue: { enabled: true },
    });
    editor.history.undo();
    expect(editor.blocks.getBlockNode(id)).toMatchObject({
      type: "paragraph",
      props: { count: "invalid", title: "Preserved", required: "Present" },
    });
    editor.history.redo();
    expect(editor.blocks.getBlockNode(id)).toMatchObject({ type: "card", props: { count: 1 } });

    const failing = editor.blocks.insertBlock({ type: "paragraph", props: { required: 3 } }).id;
    expect(() => editor.blocks.setBlockType(failing, "card")).toThrow();
    expect(editor.blocks.getBlockNode(failing)).toMatchObject({
      type: "paragraph",
      props: { required: 3 },
    });
    editor.destroy();
  });

  it("evaluates dynamic defaults once per creation and conversion", async () => {
    const editor = await createDocumentEditor();
    let sequence = 0;
    editor.blockRegistry.defineBlock({
      type: "dynamic",
      defaultProps: () => ({ sequence: ++sequence, repaired: sequence }),
      propSchema: z.object({ sequence: z.number(), repaired: z.number() }),
    });

    const first = editor.blocks.insertBlock({ type: "dynamic" }).id;
    const second = editor.blocks.insertBlock({ type: "dynamic" }).id;
    const converted = editor.blocks.insertBlock({
      type: "paragraph",
      props: { repaired: "invalid", extra: true },
    }).id;
    editor.blocks.setBlockType(converted, "dynamic");

    expect(editor.blocks.getBlockNode(first)?.props).toEqual({ sequence: 1, repaired: 1 });
    expect(editor.blocks.getBlockNode(second)?.props).toEqual({ sequence: 2, repaired: 2 });
    expect(editor.blocks.getBlockNode(converted)?.props).toEqual({
      sequence: 3,
      repaired: 3,
      extra: true,
    });
    expect(sequence).toBe(3);
    editor.destroy();
  });

  it("clears block content and descendants without losing block-owned data", async () => {
    const editor = await createDocumentEditor();
    const id = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { collapsed: true },
      props: { tone: "info" },
      pluginData: { test: { pinned: true } },
      content: "Parent",
      children: [
        {
          type: "paragraph",
          content: "Child",
          children: [{ type: "paragraph", content: "Grandchild" }],
        },
      ],
    }).id;
    const childId = editor.blocks.getBlockNode(id)!.childIds[0]!;
    const outsideId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Outside" },
      editor.blocks.getInsertionDestinationAfter(id),
    ).id;
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
    expect(editor.blocks.hasBlock(childId)).toBe(false);
    expect(editor.blocks.getBlockNode(outsideId)?.content).toBe("Outside");

    editor.history.undo();
    expect(editor.blocks.getBlock(id)).toMatchObject({
      content: "Parent",
      children: [{ id: childId, children: [{ content: "Grandchild" }] }],
    });
    editor.history.redo();
    expect(editor.blocks.getBlock(id)).toMatchObject({ content: "", children: [] });
    editor.destroy();
  });

  it("batches several block clears into one update and undo step", async () => {
    const editor = await createDocumentEditor();
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "First",
      children: [{ type: "paragraph", content: "First child" }],
    }).id;
    const second = editor.blocks.insertBlock(
      {
        type: "paragraph",
        content: "Second",
        children: [{ type: "paragraph", content: "Second child" }],
      },
      editor.blocks.getInsertionDestinationAfter(first),
    ).id;
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

  it("preserves opaque list properties across block types", async () => {
    const editor = await createDocumentEditor();
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
    const initiallyCollapsed = editor.blocks.insertBlock(
      {
        type: "paragraph",
        listProps: { collapsed: true },
        children: [{ type: "paragraph" }],
      },
      editor.blocks.getInsertionDestinationAfter(id),
    ).id;

    expect(editor.blocks.getBlockNode(id)?.listProps.collapsed).toBeUndefined();
    expect(editor.blocks.getBlockNode(initiallyCollapsed)?.listProps.collapsed).toBe(true);
    editor.blocks.updateBlock(id, { listProps: { collapsed: true } });
    expect(editor.blocks.getBlockNode(id)).toMatchObject({
      listProps: { collapsed: true },
      props: { tone: "info" },
    });
    editor.blocks.updateBlock(id, { listProps: { collapsed: "yes" } });
    expect(editor.blocks.getBlockNode(id)?.listProps.collapsed).toBe("yes");
    editor.blocks.updateBlock(id, { listProps: { collapsed: true } });
    expect(editor.blocks.getBlockNode(id)?.listProps.collapsed).toBe(true);

    editor.blocks.setBlockType(id, "heading2");
    expect(editor.blocks.getBlockNode(id)?.props).toEqual({ tone: "info" });
    expect(editor.blocks.getBlockNode(id)?.listProps.collapsed).toBe(true);
    editor.destroy();
  });

  it("merges, portability-checks, and undoes opaque list state atomically", async () => {
    const editor = await createDocumentEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const second = editor.blocks.insertBlock(
      {
        type: "paragraph",
        listProps: { type: "checkbox", checked: true },
      },
      editor.blocks.getInsertionDestinationAfter(first),
    ).id;

    expect(editor.blocks.getBlockNode(first)?.listProps).toEqual({});
    expect(editor.blocks.getBlockNode(second)?.listProps).toEqual({
      type: "checkbox",
      checked: true,
    });

    editor.blocks.updateBlocks([
      { id: first, patch: { listProps: { type: "start_numbered_list" } } },
      { id: second, patch: { listProps: { checked: false } } },
    ]);
    expect(editor.blocks.getBlockNode(first)?.listProps.type).toBe("start_numbered_list");
    expect(editor.blocks.getBlockNode(second)?.listProps.checked).toBe(false);

    expect(() =>
      editor.blocks.updateBlocks([
        { id: first, patch: { listProps: { type: "list" } } },
        { id: second, patch: { listProps: { checked: Number.POSITIVE_INFINITY } } },
      ]),
    ).toThrow("block.listProps.checked must be a finite number");
    expect(editor.blocks.getBlockNode(first)?.listProps.type).toBe("start_numbered_list");

    editor.history.undo();
    expect(editor.blocks.getBlockNode(first)?.listProps.type).toBeUndefined();
    expect(editor.blocks.getBlockNode(second)?.listProps.checked).toBe(true);
    editor.history.redo();
    expect(editor.blocks.getBlockNode(first)?.listProps.type).toBe("start_numbered_list");
    expect(editor.blocks.getBlockNode(second)?.listProps.checked).toBe(false);
    editor.destroy();
  });

  it("updates several blocks atomically in supplied order and undoes once", async () => {
    const editor = await createDocumentEditor();
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "First",
      children: [{ type: "paragraph", content: "First child" }],
    }).id;
    const leaf = editor.blocks.insertBlock(
      { type: "paragraph", content: "Leaf" },
      editor.blocks.getInsertionDestinationAfter(first),
    ).id;
    const second = editor.blocks.insertBlock(
      {
        type: "paragraph",
        content: "Second",
        children: [{ type: "paragraph", content: "Second child" }],
      },
      editor.blocks.getInsertionDestinationAfter(leaf),
    ).id;
    const updates = jest.fn();
    const unsubscribe = editor.subscribe(updates);

    editor.blocks.updateBlocks([
      { id: first, patch: { listProps: { collapsed: true }, props: { order: "first" } } },
      { id: leaf, patch: { listProps: { collapsed: true } } },
      { id: second, patch: { listProps: { collapsed: true } } },
      { id: first, patch: { props: { order: "last" } } },
    ]);

    expect(updates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlockNode(first)).toMatchObject({
      listProps: { collapsed: true },
      props: { order: "last" },
    });
    expect(editor.blocks.getBlockNode(second)?.listProps.collapsed).toBe(true);
    expect(editor.blocks.getBlockNode(leaf)?.listProps.collapsed).toBe(true);
    expect(() =>
      editor.blocks.updateBlocks([
        { id: first, patch: { listProps: { collapsed: false } } },
        { id: "missing", patch: { listProps: { collapsed: true } } },
      ]),
    ).toThrow("Block missing not found");
    expect(editor.blocks.getBlockNode(first)?.listProps.collapsed).toBe(true);
    expect(updates).toHaveBeenCalledTimes(1);

    editor.history.undo();
    expect(editor.blocks.getBlockNode(first)).toMatchObject({ listProps: {}, props: {} });
    expect(editor.blocks.getBlockNode(second)?.listProps.collapsed).toBeUndefined();
    expect(editor.blocks.getBlockNode(leaf)?.listProps.collapsed).toBeUndefined();
    unsubscribe();
    editor.destroy();
  });

  it("synchronizes collapse state through the CRDT document", async () => {
    const leftDocument = new YjsDoc("collapse-left");
    const rightDocument = new YjsDoc("collapse-right");
    const leftFixture = await createDocumentEditor({
      document: new DocumentModelImpl(leftDocument),
    });
    const left = leftFixture;
    const rightFixture = await createDocumentEditor({
      document: new DocumentModelImpl(rightDocument),
    });
    const right = rightFixture;
    const parent = left.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Child" }],
    }).id;
    Y.applyUpdate(rightDocument.doc, Y.encodeStateAsUpdate(leftDocument.doc));

    left.blocks.updateBlocks([{ id: parent, patch: { listProps: { collapsed: true } } }]);
    Y.applyUpdate(rightDocument.doc, Y.encodeStateAsUpdate(leftDocument.doc));

    expect(right.blocks.getBlockNode(parent)?.listProps.collapsed).toBe(true);
    leftFixture.destroy();
    void leftDocument.destroy();
    rightFixture.destroy();
    void rightDocument.destroy();
  });

  it("notifies subscribers once for every successful block command", async () => {
    const editor = await createDocumentEditor();
    let firstId = "";
    let secondId = "";

    expectOneUpdate(editor, () => {
      firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    });
    expectOneUpdate(editor, () => {
      secondId = editor.blocks.insertBlock(
        { type: "paragraph", content: "Second" },
        editor.blocks.getInsertionDestinationAfter(firstId),
      ).id;
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

  it("outdents once and adopts every following sibling after existing children", async () => {
    const editor = await createDocumentEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const beforeId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Before" },
      editor.blocks.getInsertionDestinationAfter(parentId),
    ).id;
    editor.blocks.indentBlock(beforeId);
    const currentId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Current" },
      editor.blocks.getInsertionDestinationAfter(beforeId),
    ).id;
    const existingChildId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Existing child" },
      editor.blocks.getInsertionDestinationAfter(currentId),
    ).id;
    editor.blocks.indentBlock(existingChildId);
    const followingId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Following" },
      editor.blocks.getInsertionDestinationAfter(currentId),
    ).id;
    const lastId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Last" },
      editor.blocks.getInsertionDestinationAfter(followingId),
    ).id;

    expectOneUpdate(editor, () => editor.blocks.outdentBlock(currentId));

    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: parentId, children: [{ id: beforeId }] },
      {
        id: currentId,
        children: [{ id: existingChildId }, { id: followingId }, { id: lastId }],
      },
    ]);

    editor.history.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([
      {
        id: parentId,
        children: [
          { id: beforeId },
          { id: currentId, children: [{ id: existingChildId }] },
          { id: followingId },
          { id: lastId },
        ],
      },
    ]);
    editor.destroy();
  });

  it("indents consecutive selected roots as one group without moving descendants twice", async () => {
    const editor = await createDocumentEditor();
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" }).id;
    const firstId = editor.blocks.insertBlock(
      { type: "paragraph", content: "First" },
      editor.blocks.getInsertionDestinationAfter(previousId),
    ).id;
    const childId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Child" },
      editor.blocks.getInsertionDestinationAfter(firstId),
    ).id;
    editor.blocks.indentBlock(childId);
    const secondId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Second" },
      editor.blocks.getInsertionDestinationAfter(firstId),
    ).id;

    const documentUpdates = jest.fn();
    const unsubscribe = editor.subscribe(documentUpdates);
    editor.blocks.indentBlocks([firstId, childId, secondId]);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toMatchObject([
      {
        id: previousId,
        children: [{ id: firstId, children: [{ id: childId }] }, { id: secondId }],
      },
    ]);
    editor.history.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: previousId },
      { id: firstId, children: [{ id: childId }] },
      { id: secondId },
    ]);
    unsubscribe();
    editor.destroy();
  });

  it("does not partially indent a non-consecutive selection", async () => {
    const editor = await createDocumentEditor();
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" }).id;
    const firstId = editor.blocks.insertBlock(
      { type: "paragraph", content: "First" },
      editor.blocks.getInsertionDestinationAfter(previousId),
    ).id;
    const gapId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Gap" },
      editor.blocks.getInsertionDestinationAfter(firstId),
    ).id;
    const lastId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Last" },
      editor.blocks.getInsertionDestinationAfter(gapId),
    ).id;
    const documentUpdates = jest.fn();
    const unsubscribe = editor.subscribe(documentUpdates);

    editor.blocks.indentBlocks([firstId, lastId]);

    expect(documentUpdates).not.toHaveBeenCalled();
    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([
      previousId,
      firstId,
      gapId,
      lastId,
    ]);
    unsubscribe();
    editor.destroy();
  });

  it("rejects moving a block into its own subtree", async () => {
    const editor = await createDocumentEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const childId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Child" },
      editor.blocks.getInsertionDestinationAfter(parentId),
    ).id;
    editor.blocks.indentBlock(childId);

    expect(() => editor.blocks.moveBlock(parentId, childId)).toThrow("relative to its descendant");
    expect(editor.blocks.getBlocks()).toMatchObject([
      {
        id: parentId,
        children: [{ id: childId }],
      },
    ]);
    editor.destroy();
  });

  it("moves one block with its nested subtree in one undoable update", async () => {
    const editor = await createDocumentEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const childId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Child" },
      editor.blocks.getInsertionDestinationAfter(parentId),
    ).id;
    editor.blocks.indentBlock(childId);
    const targetId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Target" },
      editor.blocks.getInsertionDestinationAfter(parentId),
    ).id;
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

  it("moves sibling roots in source order as one undoable update", async () => {
    const editor = await createDocumentEditor();
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const gapId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Gap" },
      editor.blocks.getInsertionDestinationAfter(firstId),
    ).id;
    const secondId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Second" },
      editor.blocks.getInsertionDestinationAfter(gapId),
    ).id;
    const targetId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Target" },
      editor.blocks.getInsertionDestinationAfter(secondId),
    ).id;
    const childId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Child" },
      editor.blocks.getInsertionDestinationAfter(firstId),
    ).id;
    editor.blocks.indentBlock(childId);
    const documentUpdates = jest.fn();
    const unsubscribe = editor.subscribe(documentUpdates);

    editor.blocks.moveBlocks([secondId, childId, firstId], targetId, "after");

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([
      gapId,
      targetId,
      firstId,
      secondId,
    ]);
    expect(editor.blocks.getBlock(firstId)?.children).toMatchObject([{ id: childId }]);
    editor.history.undo();
    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([
      firstId,
      gapId,
      secondId,
      targetId,
    ]);
    unsubscribe();
    editor.destroy();
  });

  it("keeps a long same-parent move adjacent to its target and undoable", async () => {
    const editor = await createDocumentEditor();
    const ids = Array.from(
      { length: 16 },
      (value, index) =>
        editor.blocks.insertBlock({
          type: "paragraph",
          content: `Block ${index}`,
        }).id,
    );
    const moving = ids.slice(2, 12);

    editor.blocks.moveBlocks(moving, ids[13]!, "after");

    expect(editor.blocks.getRootIds()).toEqual([
      ...ids.slice(0, 2),
      ids[12],
      ids[13],
      ...moving,
      ...ids.slice(14),
    ]);
    editor.history.undo();
    expect(editor.blocks.getRootIds()).toEqual(ids);
    editor.destroy();
  });

  it("moves roots from different parents in canonical order with one undo and redo", async () => {
    const editor = await createDocumentEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const childId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Child" },
      editor.blocks.getInsertionDestinationAfter(parentId),
    ).id;
    editor.blocks.indentBlock(childId);
    const siblingId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Sibling" },
      editor.blocks.getInsertionDestinationAfter(parentId),
    ).id;

    const before = editor.blocks.getBlocks();
    const updates = jest.fn();
    const stop = editor.subscribe(updates);
    editor.blocks.moveBlocks([siblingId, childId, childId], parentId, "before");
    expect(editor.blocks.getRootIds()).toEqual([childId, siblingId, parentId]);
    expect(editor.blocks.getBlockNode(parentId)?.childIds).toEqual([]);
    expect(updates).toHaveBeenCalledTimes(1);
    editor.history.undo();
    expect(editor.blocks.getBlocks()).toEqual(before);
    editor.history.redo();
    expect(editor.blocks.getRootIds()).toEqual([childId, siblingId, parentId]);
    stop();
    editor.destroy();
  });

  it("moves a block before a nested sibling", async () => {
    const editor = await createDocumentEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const firstId = editor.blocks.insertBlock(
      { type: "paragraph", content: "First" },
      editor.blocks.getInsertionDestinationAfter(parentId),
    ).id;
    editor.blocks.indentBlock(firstId);
    const secondId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Second" },
      editor.blocks.getInsertionDestinationAfter(firstId),
    ).id;
    const movedId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Moved" },
      editor.blocks.getInsertionDestinationAfter(parentId),
    ).id;

    editor.blocks.moveBlock(movedId, secondId, "before");

    expect(editor.blocks.getBlocks()).toMatchObject([
      {
        id: parentId,
        children: [{ id: firstId }, { id: movedId }, { id: secondId }],
      },
    ]);
    editor.destroy();
  });

  it("moves a block inside another block as its last child", async () => {
    const editor = await createDocumentEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const existingChildId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Existing" },
      editor.blocks.getInsertionDestinationAfter(parentId),
    ).id;
    editor.blocks.indentBlock(existingChildId);
    const movedId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Moved" },
      editor.blocks.getInsertionDestinationAfter(parentId),
    ).id;

    editor.blocks.moveBlock(movedId, parentId, "inside");

    expect(editor.blocks.getBlocks()).toMatchObject([
      {
        id: parentId,
        children: [{ id: existingChildId }, { id: movedId }],
      },
    ]);
    editor.destroy();
  });

  it("outdents consecutive selected roots as one group and adopts their following siblings", async () => {
    const editor = await createDocumentEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const beforeId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Before" },
      editor.blocks.getInsertionDestinationAfter(parentId),
    ).id;
    editor.blocks.indentBlock(beforeId);
    const firstId = editor.blocks.insertBlock(
      { type: "paragraph", content: "First" },
      editor.blocks.getInsertionDestinationAfter(beforeId),
    ).id;
    const existingChildId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Existing child" },
      editor.blocks.getInsertionDestinationAfter(firstId),
    ).id;
    editor.blocks.indentBlock(existingChildId);
    const secondId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Second" },
      editor.blocks.getInsertionDestinationAfter(firstId),
    ).id;
    const followingId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Following" },
      editor.blocks.getInsertionDestinationAfter(secondId),
    ).id;

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
    expect(editor.blocks.getBlocks()).toMatchObject([
      {
        id: parentId,
        children: [
          { id: beforeId },
          { id: firstId, children: [{ id: existingChildId }] },
          { id: secondId },
          { id: followingId },
        ],
      },
    ]);
    unsubscribe();
    editor.destroy();
  });

  it("merges text and descendants in one undoable update", async () => {
    const editor = await createDocumentEditor();
    const targetId = editor.blocks.insertBlock({ type: "paragraph", content: "Before" }).id;
    const targetChildId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Target child" },
      editor.blocks.getInsertionDestinationAfter(targetId),
    ).id;
    editor.blocks.indentBlock(targetChildId);
    const sourceId = editor.blocks.insertBlock(
      { type: "paragraph", content: "After" },
      editor.blocks.getInsertionDestinationAfter(targetId),
    ).id;
    const sourceChildId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Source child" },
      editor.blocks.getInsertionDestinationAfter(sourceId),
    ).id;
    editor.blocks.indentBlock(sourceChildId);
    let joinOffset = -1;

    expectOneUpdate(editor, () => {
      joinOffset = editor.blocks.mergeBlocks(targetId, sourceId);
    });

    expect(joinOffset).toBe("Before".length);
    expect(editor.blocks.getBlocks()).toMatchObject([
      {
        id: targetId,
        content: "BeforeAfter",
        children: [{ id: targetChildId }, { id: sourceChildId }],
      },
    ]);
    expect(editor.blocks.hasBlock(sourceId)).toBe(false);

    editor.history.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: targetId, content: "Before", children: [{ id: targetChildId }] },
      { id: sourceId, content: "After", children: [{ id: sourceChildId }] },
    ]);
    editor.destroy();
  });

  it("stops notifying after unsubscribe", async () => {
    const editor = await createDocumentEditor();
    const listener = jest.fn();
    const unsubscribe = editor.subscribe(listener);

    unsubscribe();
    editor.blocks.insertBlock({ type: "paragraph" });

    expect(listener).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("does not notify when a command fails", async () => {
    const editor = await createDocumentEditor();
    const listener = jest.fn();
    editor.subscribe(listener);
    const before = editor.revision;

    expect(() => editor.blocks.insertBlock({ type: "missing" })).toThrow("not registered");

    expect(listener).not.toHaveBeenCalled();
    expect(editor.revision).toBe(before);
    editor.destroy();
  });

  it("loads and dumps snapshots through editor methods", async () => {
    const editor = await createDocumentEditor();
    const sourceId = editor.blocks.insertBlock({ type: "paragraph", content: "Source" }).id;
    const targetId = editor.blocks.insertBlock(
      { type: "paragraph", content: "Target" },
      editor.blocks.getInsertionDestinationAfter(sourceId),
    ).id;

    expect(editor.dump()).toMatchObject({
      version: 9,
      blocks: [{ id: sourceId }, { id: targetId }],
    });

    editor.load({
      version: 9,
      blocks: [
        {
          id: "loaded",
          type: "paragraph",
          listProps: { collapsed: false, type: "list", checked: false },
          props: {},
          pluginData: {},
          content: "Loaded",
          children: [],
        },
      ],
    });

    expect(editor.blocks.getBlocks()).toMatchObject([{ id: "loaded", content: "Loaded" }]);
    expect(() => editor.load({ version: 3, blocks: [] } as never)).toThrow(
      "Unsupported Rivto document snapshot version: 3",
    );
    expect(editor.blocks.getBlocks()).toMatchObject([{ id: "loaded", content: "Loaded" }]);
    expect(() =>
      editor.load({
        version: 9,
        blocks: [
          {
            id: "invalid",
            type: "paragraph",
            props: {},
            pluginData: {},
            content: "",
            children: [],
          },
        ],
      } as never),
    ).toThrow("block.listProps must be an object");
    editor.destroy();
  });
});

it("rejects a missing group member or stale destination before changing any source", async () => {
  const editor = await createDocumentEditor();
  const parent = editor.blocks.insertBlock({
    type: "paragraph",
    children: [{ type: "paragraph" }],
  });
  const other = editor.blocks.insertBlock({ type: "paragraph" });
  const child = editor.blocks.getBlockNode(parent.id)!.childIds[0]!;
  const before = editor.blocks.getBlocks();
  const updates = jest.fn();
  const stop = editor.subscribe(updates);
  expect(() => editor.blocks.moveBlocks([other.id, "missing"], parent.id, "before")).toThrow();
  expect(() =>
    editor.blocks.moveBlocks([child, "missing", other.id], parent.id, "before"),
  ).toThrow();
  expect(() => editor.blocks.moveBlocks([child, other.id], "deleted", "inside")).toThrow();
  expect(editor.blocks.getBlocks()).toEqual(before);
  expect(updates).not.toHaveBeenCalled();
  stop();
  editor.destroy();
});

it("filters selected descendants across parents and rejects destinations in any selected subtree", async () => {
  const editor = await createDocumentEditor();
  const first = editor.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  const second = editor.blocks.insertBlock({
    type: "paragraph",
    children: [{ type: "paragraph" }],
  });
  const target = editor.blocks.insertBlock({ type: "paragraph" });
  const firstChild = editor.blocks.getBlockNode(first.id)!.childIds[0]!;
  const secondChild = editor.blocks.getBlockNode(second.id)!.childIds[0]!;
  const before = editor.blocks.getBlocks();
  expect(() => editor.blocks.moveBlocks([first.id, secondChild], firstChild, "before")).toThrow();
  expect(editor.blocks.getBlocks()).toEqual(before);
  editor.blocks.moveBlocks([secondChild, firstChild, first.id], target.id, "inside");
  expect(editor.blocks.getBlockNode(target.id)?.childIds).toEqual([first.id, secondChild]);
  expect(editor.blocks.getBlockNode(first.id)?.childIds).toEqual([firstChild]);
  expect(editor.blocks.getBlockNode(second.id)?.childIds).toEqual([]);
  editor.history.undo();
  expect(editor.blocks.getBlocks()).toEqual(before);
  editor.destroy();
});

it("normalizes mixed-parent roots without loading unrelated descendant snapshots", async () => {
  const editor = await createDocumentEditor();
  const first = editor.blocks.insertBlock({
    type: "paragraph",
    children: Array.from({ length: 100 }, () => ({ type: "paragraph" })),
  });
  const second = editor.blocks.insertBlock({ type: "paragraph" });
  const target = editor.blocks.insertBlock({ type: "paragraph" });
  const children = editor.blocks.getBlockNode(first.id)!.childIds;
  const read = jest.spyOn(editor.blocks, "getBlockNode");
  editor.blocks.moveBlocks([second.id, children[0]!], target.id, "inside");
  const visited = new Set(read.mock.calls.map(([id]) => id));
  expect(children.slice(1).some((id) => visited.has(id))).toBe(false);
  expect(editor.blocks.getBlockNode(target.id)?.childIds).toEqual([children[0], second.id]);
  read.mockRestore();
  editor.destroy();
});
