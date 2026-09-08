/**
 * Regression tests for per-block selection snapshots used by React chrome.
 *
 * `useBlockSelected` and `useEditorSelection` read `isBlockSelected` /
 * `snapshot()`. Caret publishes must not flip whole-block chrome, identical
 * `set` calls must keep snapshot identity, and selection must not bump
 * `editor.revision` (so EditorView does not re-render the tree).
 */
import { createTestCoreEditor as createEditor } from "../../test-utils";
import { createReactEditor } from "../../react-editor";

describe("useBlockSelected / useEditorSelection store contract", () => {
  test("snapshot identity is stable until set actually changes", () => {
    const editor = createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Text" });
    const caret = [{
      type: "text" as const,
      anchor: { blockId: id, offset: 1 },
      head: { blockId: id, offset: 1 },
    }];
    editor.selection.set(caret);
    const snapshot = editor.selection.snapshot();
    editor.selection.set(caret);
    expect(editor.selection.snapshot()).toBe(snapshot);
    editor.destroy();
  });

  test("caret selection does not mark the block selected", () => {
    const editor = createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Text" });
    editor.selection.set([{
      type: "text",
      anchor: { blockId: id, offset: 1 },
      head: { blockId: id, offset: 1 },
    }]);
    expect(editor.selection.isBlockSelected(id)).toBe(false);
    expect(editor.selection.snapshot()[0]?.type).toBe("text");
    editor.destroy();
  });

  test("whole-block selection marks only member ids", () => {
    const editor = createEditor();
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    editor.selection.set([{
      type: "block",
      blockIds: [firstId],
      anchorBlockId: firstId,
      focusBlockId: firstId,
    }]);
    expect(editor.selection.isBlockSelected(firstId)).toBe(true);
    expect(editor.selection.isBlockSelected(secondId)).toBe(false);
    expect(editor.selection.snapshot()).toHaveLength(1);
    editor.destroy();
  });

  test("selection set does not bump the React editor revision", () => {
    const editor = createEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Text" });
    const reactEditor = createReactEditor({ editor });
    const before = reactEditor.revision;
    editor.selection.set([{
      type: "text",
      anchor: { blockId: id, offset: 0 },
      head: { blockId: id, offset: 2 },
    }]);
    expect(reactEditor.revision).toBe(before);
    reactEditor.destroy();
    editor.destroy();
  });
});
