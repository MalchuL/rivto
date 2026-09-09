/**
 * Verifies editor-owned outline policies against the generic document store.
 * Exercises page and edgeless runtimes, rejected child adoption, and atomic
 * placement preflight so failed commands cannot leave partial document writes.
 */
import { createTestEditor } from "../../editor/test-utils";

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
    const before = editor.document.getSnapshot();
    expect(editor.document.blocks).not.toHaveProperty("mergeBlocks");
    expect(editor.document.blocks).not.toHaveProperty("indentBlocks");
    expect(editor.document.blocks).not.toHaveProperty("outdentBlocks");
    expect(editor.blocks.mergeBlocks(target, source)).toBe(6);
    expect(editor.blocks.getBlock(target)?.content).toBe("Hello world");
    expect(editor.blocks.getChildIds(target)).toEqual(["child"]);
    editor.history.undo();
    expect(editor.document.getSnapshot()).toEqual(before);
    editor.destroy();
  });

  it("rejects merge and outdent adoption before changing text or hierarchy", () => {
    const editor = createTestEditor({ mode });
    editor.blocksRegistry.defineBlock({ type: "container" });
    editor.blocksRegistry.defineBlock({ type: "restricted", allowedParents: ["container"] });
    const target = editor.blocks.insertBlock({ type: "paragraph", content: "Target" });
    const source = editor.blocks.insertBlock({
      type: "container",
      content: "Source",
      children: [
        { id: "first", type: "paragraph" },
        { id: "restricted", type: "restricted" },
      ],
    });
    const before = editor.document.getSnapshot();
    expect(() => editor.blocks.mergeBlocks(target, source)).toThrow(/cannot be placed under paragraph/);
    expect(editor.document.getSnapshot()).toEqual(before);
    expect(() => editor.blocks.outdentBlock("first")).toThrow(/cannot be placed under paragraph/);
    expect(editor.document.getSnapshot()).toEqual(before);
    expect(() => editor.blocks.mergeBlocks("missing", source)).toThrow("Block missing not found");
    expect(() => editor.blocks.mergeBlocks("first", source)).toThrow(/into its descendant/);
    expect(editor.document.getSnapshot()).toEqual(before);
    editor.destroy();
  });

  it("preflights all selected moves before writing an accepted earlier move", () => {
    const editor = createTestEditor({ mode });
    editor.blocksRegistry.defineBlock({ type: "root-only", allowedParents: [null] });
    const restricted = editor.blocks.insertBlock({ type: "root-only" });
    const movable = editor.blocks.insertBlock({ type: "paragraph" });
    const target = editor.blocks.insertBlock({ type: "paragraph" });
    // Reverse execution for 'after' makes the valid move execute first unless
    // the complete batch is checked before any shared arrays are changed.
    const child = editor.blocks.insertBlock({ type: "paragraph" });
    editor.blocks.moveBlock(child, target, "inside");
    const nested = editor.document.getSnapshot();
    expect(() => editor.blocks.moveBlocks([restricted, movable], child, "after"))
      .toThrow(/cannot be placed under paragraph/);
    expect(editor.document.getSnapshot()).toEqual(nested);
    editor.destroy();
  });
});
