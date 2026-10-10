import { createCaretSelection, createStructuralSelection, createTextSelection } from "@chulane/rivto";
import { createTestReactEditor as createReactEditor } from "../../test-utils";
/**
 * Regression tests for per-block selection snapshots used by React chrome.
 *
 * `useBlockSelected` and `useEditorSelection` read `isBlockSelected` /
 * `snapshot()`. Caret publishes must not flip whole-block chrome, identical
 * `set` calls must keep snapshot identity, and selection must not bump
 * `editor.revision` (so EditorView does not re-render the tree).
 */
import { createTestCoreEditor as createEditor } from "../../test-utils";


describe("useBlockSelected / useEditorSelection store contract", () => {
  test("snapshot identity is stable until set actually changes", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Text" }).id;
    const caret = createCaretSelection(id, 1);
    editorView.selection.set(caret);
    const snapshot = editor.selection.snapshot();
    editorView.selection.set(caret);
    expect(editor.selection.snapshot()).toBe(snapshot);
    editorView.runtime.destroy();
    editor.destroy();
  });

  test("caret selection does not mark the block selected", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Text" }).id;
    editorView.selection.set(createCaretSelection(id, 1));
    expect(editor.selection.isBlockSelected(id)).toBe(false);
    expect(editor.selection.snapshot()).toMatchObject({
      type: "selection",
      blocks: [{ id, start: 1, end: 1 }],
    });
    editorView.runtime.destroy();
    editor.destroy();
  });

  test("whole-block selection marks only member ids", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId).id;
    editor.selection.set(createStructuralSelection([firstId]));
    expect(editor.selection.isBlockSelected(firstId)).toBe(true);
    expect(editor.selection.isBlockSelected(secondId)).toBe(false);
    expect(editor.selection.snapshot()?.blocks).toHaveLength(1);
    editorView.runtime.destroy();
    editor.destroy();
  });

  test("selection set does not bump the React editor revision", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Text" }).id;
    const before = editorView.runtime.revision;
    editorView.selection.set(
      createTextSelection([{ id, length: 4 }], { blockId: id, offset: 0 }, { blockId: id, offset: 2 })!,
    );
    expect(editorView.runtime.revision).toBe(before);
    editorView.runtime.destroy();
    editor.destroy();
  });
});
