/**
 * Collapse presentation when remote `collapsed` updates should wait for reload.
 *
 * The shared document still stores the remote value. `syncView: false` makes
 * this editor's block reads keep the session value.
 *
 * @module
 */
import { YjsDoc, type RivtoEditorApi } from "@chulane/rivto";
import { createReactEditor } from "../../../../react-editor";
import { createTestCoreEditor } from "../../../../test-utils";
import { collapseExtension, standardPreset } from "../../built-ins";

/**
 * Copies one editor document into another as a remote update.
 *
 * @param from - Editor whose replicated state is the source.
 * @param to - Editor that applies that state.
 * @returns No value.
 */
function replicate(from: RivtoEditorApi, to: RivtoEditorApi): void {
  to.document.crdt.applySnapshot(from.document.crdt.getSnapshot());
}

describe("collapse syncView", () => {
  it("follows remote collapse by default", () => {
    const leftEditor = createTestCoreEditor({ document: new YjsDoc("collapse-live-left") });
    const rightEditor = createTestCoreEditor({ document: new YjsDoc("collapse-live-right") });
    const left = createReactEditor({ editor: leftEditor, extensions: [collapseExtension()] });
    const right = createReactEditor({ editor: rightEditor, extensions: [collapseExtension()] });
    const parent = leftEditor.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Child" }],
    });
    replicate(leftEditor, rightEditor);

    leftEditor.blocks.updateBlock(parent, { listProps: { collapsed: true } });
    replicate(leftEditor, rightEditor);

    expect(rightEditor.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);
    left.destroy();
    right.destroy();
    void leftEditor.destroy();
    void rightEditor.destroy();
  });

  it("keeps the current editor stable when syncView is disabled", () => {
    const leftEditor = createTestCoreEditor({ document: new YjsDoc("collapse-hold-left") });
    const rightEditor = createTestCoreEditor({ document: new YjsDoc("collapse-hold-right") });
    const left = createReactEditor({ editor: leftEditor, extensions: [collapseExtension()] });
    const right = createReactEditor({
      editor: rightEditor,
      extensions: [standardPreset({ collapse: { syncView: false } })],
    });
    const parent = leftEditor.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Child" }],
    });
    replicate(leftEditor, rightEditor);

    leftEditor.blocks.updateBlock(parent, { listProps: { collapsed: true } });
    replicate(leftEditor, rightEditor);

    expect(rightEditor.blocks.getBlock(parent)?.listProps.collapsed).not.toBe(true);
    expect(rightEditor.document.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);

    rightEditor.blocks.updateBlock(parent, { listProps: { collapsed: true } });
    expect(rightEditor.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);
    replicate(rightEditor, leftEditor);
    expect(leftEditor.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);

    left.destroy();
    right.destroy();
    void leftEditor.destroy();
    void rightEditor.destroy();
  });
});
