import { createCaretSelection, createTextSelection, createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor as createEditor } from "../../test-utils";
import { createReactEditor } from "../../react-editor";

describe("ReactSelectionManager", () => {
  test("delegates text deletion and whole-block selection to core", () => {
    const editor = createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "BeforeAfter" });
    const reactEditor = createReactEditor({ editor });
    const text = createTextSelection(
      [{ id, length: 11 }],
      { blockId: id, offset: 6 },
      { blockId: id, offset: 0 },
    )!;
    reactEditor.selection.set(text);
    expect(reactEditor.selection.get()).toEqual(editor.selection.get());
    reactEditor.selection.delete();
    expect(editor.blocks.getBlock(id)?.content).toBe("After");
    expect(reactEditor.selection.get()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 0, end: 0 }],
    });
    editor.undo();
    expect(editor.blocks.getBlock(id)?.content).toBe("BeforeAfter");
    const block = createStructuralSelection([id]);
    reactEditor.selection.set(block);
    expect(editor.selection.get()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 0, end: -1 }],
      anchorBlockId: id,
      focusBlockId: id,
    });
    editor.selection.clear();
    expect(reactEditor.selection.get()).toBeUndefined();
    reactEditor.destroy();
    editor.destroy();
  });

  test("shares text editing with core and tolerates a missing active surface", () => {
    const editor = createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "text" });
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.selection;
    const selection = createCaretSelection(id, 1);

    manager.set(selection);
    expect(manager.get()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 1, end: 1 }],
      reversed: false,
    });
    expect(editor.selection.get()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 1, end: 1 }],
    });
    expect(manager.readDOM()).toBeUndefined();
    expect(manager.restoreDOM()).toBe(false);
    manager.clear();
    expect(editor.selection.get()).toBeUndefined();
    reactEditor.destroy();
    editor.destroy();
  });
});
