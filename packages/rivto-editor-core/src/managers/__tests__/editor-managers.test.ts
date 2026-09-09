import { createTestEditor as createRivtoEditor } from "../../editor/test-utils";

describe("editor block managers", () => {
  it("exposes separate registry and block managers", () => {
    const editor = createRivtoEditor();

    expect(editor.blocksRegistry.has("paragraph")).toBe(true);
    expect(editor.commands.has("block.insert")).toBe(true);
    expect(editor.commands.has("link.create")).toBe(false);
    expect("getBlock" in editor).toBe(false);
    expect("createLink" in editor).toBe(false);

    const sourceId = editor.blocks.insertBlock({ type: "paragraph", content: "Source" });
    const targetId = editor.blocks.insertBlock({ type: "paragraph", content: "Target" }, sourceId);
    editor.blocks.updateBlock(sourceId, { props: { tone: "info" } });

    expect(editor.blocks.getBlock(sourceId)?.props).toEqual({ tone: "info" });

    editor.blocks.removeBlock(targetId);
    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([sourceId]);
    editor.destroy();
  });

  it("applies selection-aware structural commands through BlockManager", () => {
    const editor = createRivtoEditor();
    const firstId = editor.blocks.insertBlock({ type: "paragraph" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph" }, firstId);

    editor.selection.set([{
      type: "block",
      blockIds: [firstId, secondId],
      anchorBlockId: firstId,
      focusBlockId: secondId,
    }]);
    editor.blocks.removeBlock(firstId);

    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.destroy();
  });
});
