/**
 * Session pins for replicated list-property flags.
 *
 * These tests cover the collapse case: the shared document keeps the remote
 * value, while the pinning editor reports the value it loaded until a new
 * session reads the document again.
 *
 * @module
 */
import { YjsDoc } from "@chulane/crdt-doc";
import type { RivtoEditorApi } from "../types";
import { createTestEditor } from "../test-utils";

/**
 * Copies one editor's replicated state into another.
 *
 * @param from - Editor whose current document state should be applied.
 * @param to - Editor that receives the update as a remote transaction.
 * @returns No value.
 */
function replicate(from: RivtoEditorApi, to: RivtoEditorApi): void {
  to.document.crdt.applySnapshot(from.document.crdt.getSnapshot());
}

/**
 * Inserts a parent with one child into an editor.
 *
 * @param editor - Editor that receives the blocks.
 * @returns Identifier of the parent block.
 */
function insertParent(editor: RivtoEditorApi): string {
  return editor.blocks.insertBlock({
    type: "paragraph",
    content: "Parent",
    children: [{ type: "paragraph", content: "Child" }],
  });
}

describe("pinned list properties", () => {
  it("keeps remote collapsed updates in the document without changing this editor", () => {
    const left = createTestEditor({ document: new YjsDoc("pin-left") });
    const right = createTestEditor({ document: new YjsDoc("pin-right") });
    const parent = insertParent(left);
    replicate(left, right);
    const release = right.blocks.pinListProp("collapsed");

    left.blocks.updateBlock(parent, { listProps: { collapsed: true } });
    replicate(left, right);

    expect(right.blocks.getBlock(parent)?.listProps.collapsed).not.toBe(true);
    expect(right.document.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);
    expect(right.dump().blocks[0]?.listProps.collapsed).toBe(true);
    const projected = right.blocks.getBlock(parent);
    expect(right.blocks.getBlock(parent)).toBe(projected);

    right.history.stopCapturing();
    right.blocks.updateBlock(parent, { content: "Edited locally" });
    expect(right.blocks.getBlock(parent)?.listProps.collapsed).not.toBe(true);
    expect(right.blocks.getBlock(parent)?.content).toBe("Edited locally");

    right.blocks.updateBlock(parent, { listProps: { collapsed: true } });
    expect(right.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);
    expect(right.document.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);

    release();
    expect(right.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);
    left.destroy();
    right.destroy();
  });

  it("still replicates local collapse edits and follows undo without adopting unrelated remote collapse", () => {
    const left = createTestEditor({ document: new YjsDoc("pin-undo-left") });
    const right = createTestEditor({ document: new YjsDoc("pin-undo-right") });
    const parent = insertParent(left);
    replicate(left, right);
    right.blocks.pinListProp("collapsed");

    right.history.stopCapturing();
    right.blocks.updateBlock(parent, { listProps: { collapsed: true } });
    expect(right.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);
    replicate(right, left);
    expect(left.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);

    right.undo();
    expect(right.blocks.getBlock(parent)?.listProps.collapsed).not.toBe(true);
    expect(right.document.blocks.getBlock(parent)?.listProps.collapsed).not.toBe(true);

    right.history.stopCapturing();
    right.blocks.updateBlock(parent, { content: "Edited" });
    left.blocks.updateBlock(parent, { listProps: { collapsed: true, checked: true } });
    replicate(left, right);

    expect(right.blocks.getBlock(parent)?.content).toBe("Edited");
    expect(right.blocks.getBlock(parent)?.listProps.checked).toBe(true);
    expect(right.blocks.getBlock(parent)?.listProps.collapsed).not.toBe(true);
    right.undo();
    expect(right.blocks.getBlock(parent)?.content).toBe("Parent");
    expect(right.blocks.getBlock(parent)?.listProps.collapsed).not.toBe(true);
    expect(right.document.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);

    left.destroy();
    right.destroy();
  });

  it("adopts collapse for blocks first seen after the pin and on a reloaded session", () => {
    const left = createTestEditor({ document: new YjsDoc("pin-reload-left") });
    const right = createTestEditor({ document: new YjsDoc("pin-reload-right") });
    const parent = insertParent(left);
    replicate(left, right);
    right.blocks.pinListProp("collapsed");

    const created = left.blocks.insertBlock({
      type: "paragraph",
      content: "Folded",
      listProps: { collapsed: true },
      children: [{ type: "paragraph", content: "Inside" }],
    }, parent);
    replicate(left, right);
    expect(right.blocks.getBlock(created)?.listProps.collapsed).toBe(true);

    left.blocks.updateBlock(parent, { listProps: { collapsed: true } });
    replicate(left, right);
    expect(right.blocks.getBlock(parent)?.listProps.collapsed).not.toBe(true);

    const reloaded = createTestEditor({ document: new YjsDoc("pin-reloaded") });
    reloaded.document.crdt.applySnapshot(right.document.crdt.getSnapshot());
    reloaded.blocks.pinListProp("collapsed");
    expect(reloaded.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);
    expect(reloaded.blocks.getBlock(created)?.listProps.collapsed).toBe(true);

    expect(() => right.blocks.pinListProp("collapsed")).toThrow(/already pinned/);
    expect(() => right.blocks.pinListProp("")).toThrow(/required/);
    left.destroy();
    right.destroy();
    reloaded.destroy();
  });
});
