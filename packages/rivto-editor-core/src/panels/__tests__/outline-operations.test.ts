import { createTestEditor } from "../../editor/test-utils";
import { ChildrenPanel } from "../children-panel";
import { EmbeddingPanel } from "../embedding-panel";

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

test("uses the real hidden parent for transitions during panel outline operations", async () => {
  const editor = await createTestEditor();
  try {
    editor.blocks.insertBlock({
      id: "boundary",
      type: "paragraph",
      children: [
        { id: "parent", type: "paragraph", children: [{ id: "nested", type: "paragraph" }] },
        { id: "other", type: "paragraph" },
      ],
    });
    const panel = new ChildrenPanel(editor, { rootBlockId: "boundary" });
    const transitions: string[] = [];
    editor.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "boundary",
      onChildEnter: ({ child }) => {
        transitions.push(`enter:${child.id}`);
        return undefined;
      },
      onChildExit: ({ child }) => {
        transitions.push(`exit:${child.id}`);
        return undefined;
      },
    });
    panel.blocks.outdentBlocks(["nested"]);
    expect(editor.blocks.getParentId("nested")).toBe("boundary");
    expect(transitions).toEqual(["enter:nested"]);
    panel.blocks.indentBlocks(["other"]);
    expect(transitions).toContain("exit:other");
    panel.blocks.removeBlocks(["nested"]);
    expect(transitions).toContain("exit:nested");
  } finally {
    await editor.destroy();
  }
});

test("nested panels retain document-wide behavior commands and parent transitions", async () => {
  const editor = await createTestEditor();
  try {
    editor.blocks.insertBlock({
      id: "outer",
      type: "paragraph",
      children: [
        { id: "inner", type: "paragraph", children: [{ id: "child", type: "paragraph" }] },
      ],
    });
    const outer = new ChildrenPanel(editor, { rootBlockId: "outer" });
    const sameRoot = new ChildrenPanel(outer, { rootBlockId: "outer" });
    expect(sameRoot.blocks.getRootIds()).toEqual(["inner"]);
    const added = sameRoot.blocks.insertBlock({ type: "paragraph" });
    expect(editor.blocks.getParentId(added.id)).toBe("outer");
    const first = sameRoot.blocks.insertBlock(
      { type: "paragraph" },
      { parentId: null, beforeId: "inner" },
    );
    const inherited = new ChildrenPanel(outer);
    expect(inherited.rootBlockId).toBe("outer");
    expect(inherited.blocks.getRootIds()).toEqual([first.id, "inner", added.id]);
    const embedded = new ChildrenPanel(new EmbeddingPanel(editor, { rootBlockId: "outer" }));
    expect(embedded.blocks.getRootIds()).toEqual(["outer"]);
    expect(embedded.blocks.canRemove("outer")).toBe(false);
    const inner = new ChildrenPanel(outer, { rootBlockId: "inner" });
    const exits: string[] = [];
    editor.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "inner" || block.id === "child",
      onStructuralDelete: (context) => {
        expect(context.documentBlocks).toBe(editor.blocks);
        return "unhandled";
      },
      onChildExit: ({ child }) => {
        exits.push(child.id!);
        return undefined;
      },
    });
    inner.blocks.removeBlocks(["child"]);
    expect(exits).toEqual(["child"]);
  } finally {
    await editor.destroy();
  }
});
