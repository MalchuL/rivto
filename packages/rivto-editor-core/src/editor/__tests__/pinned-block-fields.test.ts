/**
 * Session pins for replicated block payload.
 *
 * One editor can pin content, type, list props, props, and plugin data. The
 * shared document keeps every remote value. Editor reads keep the session
 * value until a local edit, undo/redo, or a new editor session.
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

describe("pinned block fields", () => {
  it("keeps remote collapsed updates in the document without changing this editor", () => {
    const left = createTestEditor({ document: new YjsDoc("pin-left") });
    const right = createTestEditor({ document: new YjsDoc("pin-right") });
    const parent = insertParent(left);
    replicate(left, right);
    const release = right.blocks.pinBlockField({ field: "listProps", key: "collapsed" });

    left.blocks.updateBlock(parent, { listProps: { collapsed: true } });
    replicate(left, right);

    expect(right.blocks.getBlock(parent)?.listProps.collapsed).not.toBe(true);
    expect(right.document.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);
    expect(right.dump().blocks[0]?.listProps.collapsed).toBe(true);
    const projected = right.blocks.getBlock(parent);
    expect(right.blocks.getBlock(parent)).toBe(projected);
    const roots = right.blocks.getBlocks();
    expect(right.blocks.getBlocks()).toBe(roots);

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
    right.blocks.pinBlockField({ field: "listProps", key: "collapsed" });

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
    right.blocks.pinBlockField({ field: "listProps", key: "collapsed" });

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
    reloaded.blocks.pinBlockField({ field: "listProps", key: "collapsed" });
    expect(reloaded.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);
    expect(reloaded.blocks.getBlock(created)?.listProps.collapsed).toBe(true);

    expect(() => right.blocks.pinBlockField({ field: "listProps", key: "collapsed" })).toThrow(/already pinned/);
    expect(() => right.blocks.pinBlockField({ field: "props", key: "" })).toThrow(/required/);
    expect(() => right.blocks.pinBlockField({ field: "content", key: "text" })).toThrow(/cannot be pinned by key/);
    left.destroy();
    right.destroy();
    reloaded.destroy();
  });

  it("pins content, type, one prop, and plugin data without freezing other props", () => {
    const left = createTestEditor({ document: new YjsDoc("pin-payload-left") });
    const right = createTestEditor({ document: new YjsDoc("pin-payload-right") });
    left.blocksRegistry.defineBlock({ type: "heading2" });
    right.blocksRegistry.defineBlock({ type: "heading2" });
    const parent = left.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      props: { tone: "calm", size: "sm" },
      pluginData: { demo: { n: 1 } },
      children: [{ type: "paragraph", content: "Child", props: { tone: "calm" } }],
    });
    replicate(left, right);
    const child = right.blocks.getBlock(parent)?.children[0]?.id;
    if (!child) throw new Error("child missing");
    right.blocks.pinBlockField({ field: "content" });
    right.blocks.pinBlockField({ field: "type" });
    right.blocks.pinBlockField({ field: "props", key: "tone" });
    const releasePluginData = right.blocks.pinBlockField({ field: "pluginData" });

    left.blocks.updateBlock(parent, { content: "Remote" });
    left.blocks.setBlockType(parent, "heading2");
    left.blocks.setBlockProp(parent, "tone", "hot");
    left.blocks.setBlockProp(parent, "size", "lg");
    left.blocks.setBlockPluginData(parent, "demo", { n: 2 });
    left.blocks.updateBlock(child, { content: "Remote child" });
    left.blocks.setBlockProp(child, "tone", "hot");
    replicate(left, right);

    const view = right.blocks.getBlock(parent);
    expect(view).toMatchObject({
      content: "Parent",
      type: "paragraph",
      props: { tone: "calm", size: "lg" },
      pluginData: { demo: { n: 1 } },
      children: [{ content: "Child", props: { tone: "calm" } }],
    });
    expect(right.document.blocks.getBlock(parent)).toMatchObject({
      content: "Remote",
      type: "heading2",
      props: { tone: "hot", size: "lg" },
      pluginData: { demo: { n: 2 } },
    });
    expect(right.dump().blocks[0]?.content).toBe("Remote");
    expect(right.blocks.getBlock(parent)).toBe(view);

    right.history.stopCapturing();
    right.blocks.updateBlock(parent, { content: "Edited" });
    left.blocks.setBlockProp(parent, "tone", "mild");
    replicate(left, right);
    expect(right.blocks.getBlock(parent)?.content).toBe("Edited");
    expect(right.blocks.getBlock(parent)?.props.tone).toBe("calm");

    right.undo();
    expect(right.blocks.getBlock(parent)?.content).toBe("Remote");
    expect(right.blocks.getBlock(parent)?.props.tone).toBe("calm");
    expect(right.document.blocks.getBlock(parent)?.content).toBe("Remote");
    expect(right.document.blocks.getBlock(parent)?.props.tone).toBe("mild");

    right.blocks.setBlockProp(parent, "tone", "mild");
    expect(right.blocks.getBlock(parent)?.props.tone).toBe("mild");
    expect(right.blocks.getBlock(parent)?.content).toBe("Remote");

    releasePluginData();
    expect(right.blocks.getBlock(parent)?.pluginData).toEqual({ demo: { n: 2 } });
    expect(right.blocks.getBlock(parent)?.content).toBe("Remote");

    const reloaded = createTestEditor({ document: new YjsDoc("pin-payload-reloaded") });
    reloaded.document.crdt.applySnapshot(right.document.crdt.getSnapshot());
    reloaded.blocks.pinBlockField({ field: "content" });
    reloaded.blocks.pinBlockField({ field: "props", key: "tone" });
    reloaded.blocks.pinBlockField({ field: "pluginData" });
    expect(reloaded.blocks.getBlock(parent)).toMatchObject({
      content: "Remote",
      props: { tone: "mild" },
      pluginData: { demo: { n: 2 } },
    });

    left.destroy();
    right.destroy();
    reloaded.destroy();
  });

  it("lets a later list-prop entry override one key inside a pinned list-prop map", () => {
    const left = createTestEditor({ document: new YjsDoc("pin-map-left") });
    const right = createTestEditor({ document: new YjsDoc("pin-map-right") });
    const id = left.blocks.insertBlock({
      type: "paragraph",
      content: "Row",
      listProps: { collapsed: false, checked: false },
    });
    replicate(left, right);
    right.blocks.pinBlockField({ field: "listProps" });
    left.blocks.updateBlock(id, { listProps: { collapsed: true, checked: true } });
    replicate(left, right);
    expect(right.blocks.getBlock(id)?.listProps).toEqual({ collapsed: false, checked: false });

    right.blocks.pinBlockField({ field: "listProps", key: "checked" });
    expect(right.blocks.getBlock(id)?.listProps).toEqual({ collapsed: false, checked: true });
    expect(right.document.blocks.getBlock(id)?.listProps).toEqual({ collapsed: true, checked: true });

    left.destroy();
    right.destroy();
  });
});
