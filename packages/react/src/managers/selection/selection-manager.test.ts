import { createRivtoEditor as createEditor } from "@chulane/rivto";
import { createReactEditor } from "../../react-editor";

describe("ReactSelectionManager", () => {
  test("keeps structured state in core and tolerates a missing active surface", () => {
    const editor = createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "text" });
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.selection;
    const selection = [{
      type: "text" as const,
      anchor: { blockId: id, offset: 1 },
      head: { blockId: id, offset: 1 },
    }];

    editor.selection.set(selection);
    expect("get" in manager).toBe(false);
    expect("set" in manager).toBe(false);
    expect(editor.selection.get()).toEqual(selection);
    expect(manager.readDOM()).toBeUndefined();
    expect(manager.restoreDOM()).toBe(false);
    editor.selection.clear();
    expect(editor.selection.get()).toEqual([]);
    reactEditor.destroy();
    editor.destroy();
  });
});
