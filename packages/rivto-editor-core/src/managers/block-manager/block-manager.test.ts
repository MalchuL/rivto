/**
 * Verifies editor-owned outline policies against the generic document store.
 * Exercises page and edgeless runtimes, grouped movement, imports, and command
 * behavior without coupling those policies to document storage.
 */
import { createTestEditor, createStructuralSelection } from "../../editor/test-utils";

describe.each(["block", "edgeless"] as const)("block feature ownership in %s mode", (mode) => {
  it("keeps feature commands off document storage and merges through the editor", () => {
    const editor = createTestEditor({ mode });
    const target = editor.blocks.insertBlock({ type: "paragraph", content: "Hello " });
    const source = editor.blocks.insertBlock({
      type: "paragraph",
      content: "world",
      children: [{ id: "child", type: "paragraph" }],
    });
    editor.history.clear();
    const before = editor.dump();
    const exposesDocument: "document" extends keyof typeof editor ? true : false = false;
    expect(exposesDocument).toBe(false);
    expect(editor.blocks.mergeBlocks(target, source)).toBe(6);
    expect(editor.blocks.getBlock(target)?.content).toBe("Hello world");
    expect(editor.blocks.getChildIds(target)).toEqual(["child"]);
    editor.history.undo();
    expect(editor.dump()).toEqual(before);
    editor.destroy();
  });

  it("indents only the supplied ids even when other blocks are selected", () => {
    const editor = createTestEditor({ mode });
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" });
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, previousId);
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);
    editor.selection.set(createStructuralSelection([firstId, secondId], firstId, secondId));
    editor.blocks.indentBlock(firstId);
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: previousId, children: [{ id: firstId }] },
      { id: secondId },
    ]);
    editor.destroy();
  });

  it("imports forests and reports stable source-to-destination identities", () => {
    const editor = createTestEditor({ mode });
    const root = editor.blocks.insertBlock({
      id: "source-root",
      type: "paragraph",
      children: [{ id: "source-child", type: "paragraph" }],
    });
    const source = editor.blocks.getBlock(root)!;
    editor.blocks.removeBlock(root);

    const restored = editor.blocks.importForest([source]);
    expect([...restored.idMap]).toEqual([
      ["source-root", "source-root"],
      ["source-child", "source-child"],
    ]);

    const copied = editor.blocks.importForest([source]);
    const copiedRootId = copied.idMap.get("source-root");
    const copiedChildId = copied.idMap.get("source-child");
    expect(copied.rootIds).toEqual([copiedRootId]);
    expect(copiedRootId).not.toBe("source-root");
    expect(copiedChildId).not.toBe("source-child");
    expect(copiedRootId).not.toBe(copiedChildId);
    editor.destroy();
  });
});
