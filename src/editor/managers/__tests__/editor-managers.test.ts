import { createRivtoEditor } from "../../rivto-editor";

describe("editor block and link managers", () => {
  it("exposes the nested registry and direct typed manager operations", () => {
    const editor = createRivtoEditor();

    expect(editor.blocks.registry.has("paragraph")).toBe(true);
    expect(editor.commands.has("block.insert")).toBe(true);
    expect(editor.commands.has("link.create")).toBe(true);
    expect("getBlock" in editor).toBe(false);
    expect("createLink" in editor).toBe(false);

    const sourceId = editor.blocks.insertBlock({ type: "paragraph", content: "Source" });
    const targetId = editor.blocks.insertBlock({ type: "paragraph", content: "Target" }, sourceId);
    editor.blocks.updateBlock(sourceId, { props: { tone: "info" } });
    editor.links.createLink({
      id: "manager-link",
      from: { blockId: sourceId },
      to: { blockId: targetId },
    });

    expect(editor.blocks.getBlock(sourceId)?.props).toEqual({ tone: "info" });
    expect(editor.links.getLink("manager-link")).toMatchObject({ id: "manager-link" });

    editor.links.removeLink("manager-link");
    editor.blocks.removeBlock(targetId);
    expect(editor.links.getLinks()).toEqual([]);
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
