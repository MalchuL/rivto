import { TextSelection, type ReactSelection } from "./selection-manager";
import { createTestCoreEditor as createEditor } from "../../test-utils";
import { createReactEditor } from "../../react-editor";

describe("ReactSelectionManager", () => {
  test("keeps text deletion local and switches to whole-block selection", () => {
    const editor = createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "BeforeAfter" });
    const reactEditor = createReactEditor({ editor });
    const text = { type: "text" as const, anchor: { blockId: id, offset: 6 }, head: { blockId: id, offset: 0 } };
    reactEditor.selection.set([text]);
    expect(reactEditor.selection.get()[0]).toBeInstanceOf(TextSelection);
    expect(editor.selection.get()).toEqual([]);
    reactEditor.selection.delete();
    expect(editor.blocks.getBlock(id)?.content).toBe("After");
    expect(reactEditor.selection.get()).toEqual([{ type: "text", anchor: { blockId: id, offset: 0 }, head: { blockId: id, offset: 0 } }]);
    editor.undo();
    expect(editor.blocks.getBlock(id)?.content).toBe("BeforeAfter");
    const block = { type: "block" as const, blockIds: [id], anchorBlockId: id, focusBlockId: id };
    expect(() => reactEditor.selection.set([text, block] as never)).toThrow("one existing block");
    reactEditor.selection.set([block]);
    expect(editor.selection.get()).toEqual([block]);
    editor.selection.clear();
    expect(reactEditor.selection.get()).toEqual([]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("keeps text editing out of core and tolerates a missing active surface", () => {
    const editor = createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "text" });
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.selection;
    const selection: ReactSelection = [{
      type: "text" as const,
      anchor: { blockId: id, offset: 1 },
      head: { blockId: id, offset: 1 },
    }];

    manager.set(selection);
    expect(manager.get()).toEqual(selection);
    expect(editor.selection.get()).toEqual([]);
    expect(manager.readDOM()).toBeUndefined();
    expect(manager.restoreDOM()).toBe(false);
    manager.clear();
    expect(editor.selection.get()).toEqual([]);
    reactEditor.destroy();
    editor.destroy();
  });
});
