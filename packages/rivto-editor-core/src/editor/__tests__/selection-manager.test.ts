/** Core selection invariants: whole blocks, stable snapshots, gaps, and undo. */
import { BlockSelection } from "../types";
import { createTestEditor as createRivtoEditor } from "../test-utils";

describe("EditorRuntime selection", () => {
  it.each(["block", "edgeless"] as const)("validates block-only state in %s mode", (mode) => {
    const editor = createRivtoEditor({ mode });
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const gap = editor.blocks.insertBlock({ type: "paragraph", content: "Gap" }, first);
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, gap);
    const selection = [{ type: "block" as const, blockIds: [last, first, last],
      anchorBlockId: last, focusBlockId: first }];
    const listener = jest.fn();
    const runtime = jest.fn();
    const unsubscribe = editor.selection.subscribe(listener);
    editor.subscribe(runtime);
    editor.selection.set(selection);
    const snapshot = editor.selection.snapshot();
    expect(snapshot[0]).toBeInstanceOf(BlockSelection);
    expect(snapshot[0]?.equals(snapshot[0].clone())).toBe(true);
    editor.selection.set(selection);
    expect(editor.selection.snapshot()).toBe(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(runtime).not.toHaveBeenCalled();
    expect(editor.selection.normalize()?.blocks.map((block) => block.id)).toEqual([first, last]);
    expect(editor.selection.isBlockSelected(gap)).toBe(false);
    const detached = editor.selection.get();
    detached[0]!.blockIds.length = 0;
    expect(editor.selection.get()[0]!.blockIds).toEqual([first, last]);
    expect(() => editor.execute("selection.set", { selection: [{
      type: "text", anchor: { blockId: first, offset: 0 }, head: { blockId: first, offset: 1 },
    }] })).toThrow("whole blocks only");
    expect(() => editor.selection.set([{ ...selection[0]!, focusBlockId: gap }])).toThrow("endpoints");
    expect(() => editor.selection.set([{ ...selection[0]!, blockIds: ["missing"] }])).toThrow("not found");
    expect(editor.selection.snapshot()).toBe(snapshot);
    editor.selection.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    editor.selection.set(selection);
    expect(listener).toHaveBeenCalledTimes(2);
    editor.destroy();
  });

  it("deletes every selected block without creating a fallback", () => {
    const editor = createRivtoEditor();
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    editor.selection.set([{
      type: "block",
      blockIds: [firstId, secondId],
      anchorBlockId: firstId,
      focusBlockId: secondId,
    }]);
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.selection.delete();

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.selection.get()).toEqual([]);
    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: firstId, content: "First" },
      { id: secondId, content: "Second" },
    ]);
    editor.redo();
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.selection.get()).toEqual([]);
    unsubscribe();
    editor.destroy();
  });

  it("clears deleted selections but preserves block selection across modes", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph" });

    editor.execute("selection.set", { selection: [{ type: "block", blockIds: [id], anchorBlockId: id, focusBlockId: id }] });
    editor.blocks.removeBlock(id);

    expect(editor.selection.get()).toEqual([]);

    const nextId = editor.blocks.insertBlock({ type: "paragraph" });
    editor.mode.set("edgeless");
    editor.execute("selection.set", {
      selection: [{
        type: "block",
        blockIds: [nextId],
        anchorBlockId: nextId,
        focusBlockId: nextId,
      }],
    });
    editor.mode.set("block");

    expect(editor.selection.get()).toEqual([{
      type: "block",
      blockIds: [nextId],
      anchorBlockId: nextId,
      focusBlockId: nextId,
    }]);
    editor.destroy();
  });

  it("keeps surviving IDs and direction when history removes selected blocks", () => {
    const editor = createRivtoEditor();
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    const thirdId = editor.blocks.insertBlock({ type: "paragraph", content: "Third" }, secondId);
    editor.execute("selection.set", {
      selection: [{
        type: "block",
        blockIds: [firstId, secondId, thirdId],
        anchorBlockId: thirdId,
        focusBlockId: firstId,
      }],
    });

    editor.undo();

    expect(editor.selection.get()).toEqual([{
      type: "block",
      blockIds: [firstId, secondId],
      anchorBlockId: secondId,
      focusBlockId: firstId,
    }]);
    editor.destroy();
  });

  it("filters deleted IDs and repairs block-selection endpoints", () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const firstId = editor.blocks.insertBlock({ type: "paragraph" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph" }, firstId);
    editor.execute("selection.set", {
      selection: [{
        type: "block",
        blockIds: [firstId, secondId],
        anchorBlockId: firstId,
        focusBlockId: secondId,
      }],
    });

    editor.document.blocks.removeBlock(secondId);

    expect(editor.selection.get()).toEqual([{
      type: "block",
      blockIds: [firstId],
      anchorBlockId: firstId,
      focusBlockId: firstId,
    }]);
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
      selection: [{
        type: "block",
        blockIds: [firstChildId, secondChildId],
        anchorBlockId: secondChildId,
        focusBlockId: firstChildId,
      }],
    });
    editor.blocks.outdentBlocks([firstChildId, secondChildId]);

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([parentId, firstChildId, secondChildId]);
    expect(editor.selection.get()).toEqual([{
      type: "block",
      blockIds: [firstChildId, secondChildId],
      anchorBlockId: secondChildId,
      focusBlockId: firstChildId,
    }]);
    editor.destroy();
  });

  it("uses a whole-block selection as one structural Tab range", () => {
    const editor = createRivtoEditor();
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" });
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, previousId);
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    const selection = [{ type: "block" as const, blockIds: [firstId, secondId],
      anchorBlockId: firstId, focusBlockId: secondId }];
    editor.execute("selection.set", { selection });

    editor.blocks.indentBlocks([firstId, secondId]);

    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: previousId,
      children: [{ id: firstId }, { id: secondId }],
    }]);
    expect(editor.selection.get()).toEqual(selection);
    editor.destroy();
  });

  it("indents a bottom-up block range while preserving its direction", () => {
    const editor = createRivtoEditor();
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" });
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, previousId);
    const middleId = editor.blocks.insertBlock({ type: "paragraph", content: "Middle" }, firstId);
    const lastId = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, middleId);
    const selection = [{ type: "block" as const, blockIds: [firstId, middleId, lastId],
      anchorBlockId: lastId, focusBlockId: firstId }];
    editor.execute("selection.set", { selection });
    const documentUpdates = jest.fn();
    const unsubscribe = editor.document.subscribe(documentUpdates);

    editor.blocks.indentBlocks([firstId, middleId, lastId]);

    expect(documentUpdates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toMatchObject([{
      id: previousId,
      children: [{ id: firstId }, { id: middleId }, { id: lastId }],
    }]);
    expect(editor.selection.get()).toEqual(selection);
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
      selection: [{
        type: "block",
        blockIds: [firstId, secondId],
        anchorBlockId: firstId,
        focusBlockId: secondId,
      }],
    });

    editor.blocks.moveBlock(firstId, secondId);

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([secondId, firstId]);
    expect(editor.selection.get()).toEqual([{
      type: "block",
      blockIds: [secondId, firstId],
      anchorBlockId: firstId,
      focusBlockId: secondId,
    }]);
    editor.undo();
    expect(editor.selection.get()).toEqual([{
      type: "block",
      blockIds: [firstId, secondId],
      anchorBlockId: firstId,
      focusBlockId: secondId,
    }]);
    editor.destroy();
  });
});
