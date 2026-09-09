import type { ReactSelection } from "../../managers/selection/selection-manager";
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
    const reactEditor = createReactEditor({ editor });
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Text" });
    const caret: ReactSelection = [{
      type: "text" as const,
      anchor: { blockId: id, offset: 1 },
      head: { blockId: id, offset: 1 },
    }];
    reactEditor.selection.set(caret);
    const snapshot = editor.selection.snapshot();
    reactEditor.selection.set(caret);
    expect(editor.selection.snapshot()).toBe(snapshot);
    reactEditor.destroy();
    editor.destroy();
  });

  test("caret selection does not mark the block selected", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Text" });
    reactEditor.selection.set([{
      type: "text",
      anchor: { blockId: id, offset: 1 },
      head: { blockId: id, offset: 1 },
    }]);
    expect(editor.selection.isBlockSelected(id)).toBe(false);
    expect(editor.selection.snapshot()).toEqual([]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("whole-block selection marks only member ids", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
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
    reactEditor.destroy();
    editor.destroy();
  });

  test("selection set does not bump the React editor revision", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Text" });
    const before = reactEditor.revision;
    reactEditor.selection.set([{
      type: "text",
      anchor: { blockId: id, offset: 0 },
      head: { blockId: id, offset: 2 },
    }]);
    expect(reactEditor.revision).toBe(before);
    reactEditor.destroy();
    editor.destroy();
  });
});
