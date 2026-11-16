import { createTestEditor } from "../editor/test-utils";
import { ChildrenPanel } from "./children-panel";

test("outline commands check the panel boundary, movement permissions, adopted tail and undo without React", async () => {
  const editor = await createTestEditor();
  const panel = new ChildrenPanel(editor);
  try {
    editor.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [
        { id: "first", type: "paragraph" },
        { id: "second", type: "paragraph" },
        { id: "tail", type: "paragraph" },
      ],
    });
    const checks: Array<{ ids: string[]; parent: string | null }> = [];
    let allowTail = false;
    editor.blockRegistry.registerBehavior({
      isAvailable: () => true,
      canMove: ({ sources, destination }) => {
        checks.push({ ids: sources.map(({ id }) => id), parent: destination.parentId });
        return destination.parentId !== "second" || allowTail;
      },
    });
    panel.blocks.outdentBlocks(["second"]);
    expect(checks).toEqual([
      { ids: ["second"], parent: null },
      { ids: ["tail"], parent: "second" },
    ]);
    expect(editor.blocks.getParentId("second")).toBe("parent");
    allowTail = true;
    editor.history.clear();
    panel.blocks.outdentBlocks(["second"]);
    expect(editor.blocks.getParentId("second")).toBeNull();
    expect(editor.blocks.getParentId("tail")).toBe("second");
    editor.history.undo();
    expect(editor.blocks.getParentId("second")).toBe("parent");
    expect(editor.blocks.getParentId("tail")).toBe("parent");
    panel.blocks.indentBlocks(["second"]);
    expect(editor.blocks.getParentId("second")).toBe("first");
    const embed = new ChildrenPanel(editor, { rootBlockId: "parent" });
    expect(() => embed.blocks.outdentBlocks(["first"])).toThrow("Cannot outdent outside panel");
    expect(editor.blocks.getParentId("first")).toBe("parent");
  } finally {
    await editor.destroy();
  }
});
