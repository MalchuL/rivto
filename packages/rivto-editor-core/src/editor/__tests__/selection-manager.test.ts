/** Core selection invariants: block membership, text offsets, stable snapshots, and undo. */
import { createTestEditor as createRivtoEditor, createStructuralSelection, testCaret, testRange } from "../test-utils";

/** Expected stored shape for explicit whole-block coverage. */
function whole(
  ids: string[],
  anchorBlockId: string,
  focusBlockId: string,
) {
  return {
    type: "selection" as const,
    blocks: ids.map((id) => ({ id, start: 0, end: -1 })),
    anchorBlockId,
    focusBlockId,
    reversed: false,
    elements: [],
    pluginData: {},
  };
}

describe("EditorRuntime selection", () => {
  it("does not traverse the document to reconcile selection after property-only updates", () => {
    const editor = createRivtoEditor();
    const selected = editor.blocks.insertBlock({ type: "paragraph", content: "Task" });
    editor.selection.set(testCaret(selected, 0));
    const getBlocks = jest.spyOn(editor.blocks, "getBlocks");

    editor.blocks.updateBlock(selected, { listProps: { checked: true } });
    expect(getBlocks).not.toHaveBeenCalled();

    editor.blocks.insertBlock({ type: "paragraph", content: "Next" }, selected);
    expect(getBlocks).toHaveBeenCalledTimes(1);
    editor.destroy();
  });

  it.each(["block", "edgeless"] as const)("validates block-only state in %s mode", (mode) => {
    const editor = createRivtoEditor({ mode });
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const gap = editor.blocks.insertBlock({ type: "paragraph", content: "Gap" }, first);
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, gap);
    const selection = createStructuralSelection([first, last], last, first);
    const listener = jest.fn();
    const runtime = jest.fn();
    const unsubscribe = editor.selection.subscribe(listener);
    editor.subscribe(runtime);
    editor.selection.set(selection);
    const snapshot = editor.selection.snapshot();
    expect(snapshot).toEqual(whole([first, last], last, first));
    editor.selection.set(selection);
    expect(editor.selection.snapshot()).toBe(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(runtime).not.toHaveBeenCalled();
    expect(editor.selection.resolveBlockSelection()?.blocks.map((block) => block.id)).toEqual([first, last]);
    expect(editor.selection.isBlockSelected(gap)).toBe(false);
    const detached = editor.selection.get();
    if (detached) detached.blocks.length = 0;
    expect(editor.selection.get()?.blocks.map((block) => block.id)).toEqual([first, last]);
    expect(() => editor.selection.set({ ...selection, focusBlockId: gap })).toThrow("endpoints");
    expect(() => editor.selection.set({
      ...selection,
      blocks: [{ id: "missing", start: 0, end: 0 }],
      anchorBlockId: "missing",
      focusBlockId: "missing",
    })).toThrow("not found");
    expect(editor.selection.snapshot()).toBe(snapshot);
    editor.selection.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    editor.selection.set(selection);
    expect(listener).toHaveBeenCalledTimes(2);
    editor.destroy();
  });

  it("resolves cross-block text into per-block offsets without rejecting invalid offsets", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const middle = editor.blocks.insertBlock({ type: "paragraph", content: "Middle" }, first);
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, middle);
    editor.selection.set(testRange(editor, { blockId: last, offset: 2 }, { blockId: first, offset: 1 }));

    expect(editor.selection.resolveBlockSelection()?.ranges.map(({ block, startOffset, endOffset, invalid }) => ({
      id: block.id, startOffset, endOffset, invalid,
    }))).toEqual([
      { id: first, startOffset: 1, endOffset: 5, invalid: false },
      { id: middle, startOffset: 0, endOffset: 6, invalid: false },
      { id: last, startOffset: 0, endOffset: 2, invalid: false },
    ]);

    editor.selection.set(testRange(editor, { blockId: first, offset: -1 }, { blockId: first, offset: 2 }));
    expect(editor.selection.resolveBlockSelection()?.ranges[0]?.invalid).toBe(true);
    editor.selection.set(createStructuralSelection([first]));
    expect(editor.selection.resolveBlockSelection()?.ranges[0]).toMatchObject({
      startOffset: 0, endOffset: 5, invalid: false,
    });
    editor.selection.set({
      type: "selection",
      blocks: [{ id: first, start: 0, end: -2 }],
      anchorBlockId: first,
      focusBlockId: first,
    });
    expect(editor.selection.resolveBlockSelection()?.ranges[0]?.invalid).toBe(true);
    editor.destroy();
  });

  it("deletes every selected block without creating a fallback", () => {
    const editor = createRivtoEditor();
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    editor.selection.set(createStructuralSelection([firstId, secondId], firstId, secondId));
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.selection.delete();

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.selection.get()).toBeUndefined();
    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: firstId, content: "First" },
      { id: secondId, content: "Second" },
    ]);
    editor.redo();
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.selection.get()).toBeUndefined();
    unsubscribe();
    editor.destroy();
  });

  it("clears deleted selections but preserves block selection across modes", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph" });

    editor.execute("selection.set", { selection: createStructuralSelection([id], id, id) });
    editor.blocks.removeBlock(id);

    expect(editor.selection.get()).toBeUndefined();

    const nextId = editor.blocks.insertBlock({ type: "paragraph" });
    editor.mode.set("edgeless");
    editor.execute("selection.set", {
      selection: createStructuralSelection([nextId], nextId, nextId),
    });
    editor.mode.set("block");

    expect(editor.selection.get()).toEqual(whole([nextId], nextId, nextId));
    editor.destroy();
  });

  it("keeps surviving IDs and direction when history removes selected blocks", () => {
    const editor = createRivtoEditor();
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    const thirdId = editor.blocks.insertBlock({ type: "paragraph", content: "Third" }, secondId);
    editor.execute("selection.set", {
      selection: createStructuralSelection([firstId, secondId, thirdId], thirdId, firstId),
    });

    editor.undo();

    expect(editor.selection.get()).toEqual(whole([firstId, secondId], secondId, firstId));
    editor.destroy();
  });

  it("filters deleted IDs and repairs block-selection endpoints", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const firstId = editor.blocks.insertBlock({ type: "paragraph" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph" }, firstId);
    editor.execute("selection.set", {
      selection: createStructuralSelection([firstId, secondId], firstId, secondId),
    });

    editor.document.blocks.removeBlock(secondId);

    expect(editor.selection.get()).toEqual(whole([firstId], firstId, firstId));
    editor.destroy();
  });

  it("applies selected block commands and preserves bottom-to-top outdent order", () => {
    const editor = createRivtoEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" });
    const firstChildId = editor.blocks.insertBlock({ type: "paragraph", content: "First child" }, parentId);
    const secondChildId = editor.blocks.insertBlock({ type: "paragraph", content: "Second child" }, firstChildId);

    editor.blocks.indentBlock(firstChildId);
    editor.blocks.indentBlock(secondChildId);
    expect(editor.blocks.getBlocks()).toMatchObject([{ id: parentId, children: [{ id: firstChildId }, { id: secondChildId }] }]);

    editor.execute("selection.set", {
      selection: createStructuralSelection([firstChildId, secondChildId], secondChildId, firstChildId),
    });
    editor.blocks.outdentBlocks([firstChildId, secondChildId]);

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([parentId, firstChildId, secondChildId]);
    expect(editor.selection.get()).toEqual(whole([firstChildId, secondChildId], secondChildId, firstChildId));
    editor.destroy();
  });

  it("uses a whole-block selection as one structural Tab range", () => {
    const editor = createRivtoEditor();
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" });
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, previousId);
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    const selection = createStructuralSelection([firstId, secondId], firstId, secondId);
    editor.execute("selection.set", { selection });

    editor.blocks.indentBlocks([firstId, secondId]);

    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: previousId,
      children: [{ id: firstId }, { id: secondId }],
    }]);
    expect(editor.selection.get()).toEqual(whole([firstId, secondId], firstId, secondId));
    editor.destroy();
  });

  it("indents a bottom-up block range while preserving its direction", () => {
    const editor = createRivtoEditor();
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" });
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, previousId);
    const middleId = editor.blocks.insertBlock({ type: "paragraph", content: "Middle" }, firstId);
    const lastId = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, middleId);
    const selection = createStructuralSelection([firstId, middleId, lastId], lastId, firstId);
    editor.execute("selection.set", { selection });
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.blocks.indentBlocks([firstId, middleId, lastId]);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: previousId,
      children: [{ id: firstId }, { id: middleId }, { id: lastId }],
    }]);
    expect(editor.selection.get()).toEqual(whole([firstId, middleId, lastId], lastId, firstId));
    editor.undo();
    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([previousId, firstId, middleId, lastId]);
    unsubscribe();
    editor.destroy();
  });

  it("reorders block selection IDs after moving one selected block", () => {
    const editor = createRivtoEditor();
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    editor.execute("selection.set", {
      selection: createStructuralSelection([firstId, secondId], firstId, secondId),
    });

    editor.blocks.moveBlock(firstId, secondId);

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([secondId, firstId]);
    expect(editor.selection.get()).toEqual(whole([secondId, firstId], firstId, secondId));
    editor.undo();
    expect(editor.selection.get()).toEqual(whole([firstId, secondId], firstId, secondId));
    editor.destroy();
  });

  it("deletes and pastes overlapping offsets as an empty slice against live length", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Hello" });
    editor.selection.set({
      type: "selection",
      blocks: [{ id, start: 2, end: 1 }],
      anchorBlockId: id,
      focusBlockId: id,
    });
    expect(editor.selection.resolveBlockSelection()?.ranges[0]).toMatchObject({
      startOffset: 2, endOffset: 2, invalid: true,
    });
    editor.selection.delete();
    expect(editor.blocks.getBlock(id)?.content).toBe("Hello");
    expect(editor.selection.get()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 2, end: 2 }],
    });
    editor.selection.set({
      type: "selection",
      blocks: [{ id, start: 2, end: 1 }],
      anchorBlockId: id,
      focusBlockId: id,
    });
    const caret = editor.clipboard.paste({ text: "X", defaultBlockType: "paragraph" });
    expect(editor.blocks.getBlock(id)?.content).toBe("HeXllo");
    expect(caret).toEqual({ blockId: id, offset: 3 });
    editor.destroy();
  });

  it("stores element IDs and plugin data in the generic selection", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const elementId = editor.elements.insertElement({
      type: "rectangle",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
      props: {},
    });
    editor.selection.set({
      type: "selection",
      blocks: [],
      elements: [elementId],
      pluginData: { comment: { id: "thread-1" } },
    });

    const detached = editor.selection.get()!;
    expect(editor.selection.isElementSelected(elementId)).toBe(true);
    expect(detached).toMatchObject({
      type: "selection",
      blocks: [],
      elements: [elementId],
      pluginData: { comment: { id: "thread-1" } },
    });
    detached.elements!.length = 0;
    expect(editor.selection.get()?.elements).toEqual([elementId]);

    editor.selection.delete();
    expect(editor.elements.getElement(elementId)).toBeUndefined();
    expect(editor.selection.get()).toBeUndefined();
    editor.destroy();
  });
});
