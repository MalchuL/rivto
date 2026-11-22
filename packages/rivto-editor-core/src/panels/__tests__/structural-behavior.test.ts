import { createTestEditor } from "../../editor/test-utils";
import { ChildrenPanel } from "../children-panel";

test("structural outline policies belong to the editor that performs the operation", async () => {
  const first = await createTestEditor();
  const second = await createTestEditor({ document: first.getDocument() });
  const firstPanel = new ChildrenPanel(first);
  const secondPanel = new ChildrenPanel(second);
  try {
    first.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [
        { id: "one", type: "paragraph" },
        { id: "two", type: "paragraph" },
      ],
    });
    const calls: string[] = [];
    const dispose = first.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "parent",
      onChildIndent: (context, ids) => {
        calls.push(context.block.id, ...ids);
        return "rejected";
      },
    });
    expect(firstPanel.blocks.indentBlocks(["two"])).toBe(true);
    expect(first.blocks.getParentId("two")).toBe("parent");
    expect(calls).toEqual(["parent", "two"]);
    expect(secondPanel.blocks.indentBlocks(["two"])).toBe(true);
    expect(second.blocks.getParentId("two")).toBe("one");
    first.history.undo();
    dispose();
    expect(firstPanel.blocks.indentBlocks(["two"])).toBe(true);
    expect(first.blocks.getParentId("two")).toBe("one");
  } finally {
    await second.destroy();
    await first.destroy();
  }
});

test("structural deletion sees the complete selection and runs each behavior only once", async () => {
  const editor = await createTestEditor();
  const panel = new ChildrenPanel(editor);
  try {
    editor.blocks.insertBlock({ id: "one", type: "paragraph" });
    editor.blocks.insertBlock({ id: "two", type: "paragraph" });
    const calls: string[] = [];
    editor.blockRegistry.registerBehavior({
      isAvailable: () => true,
      onStructuralDelete: (context, ids) => {
        calls.push(context.block.id, ...ids);
        return "unhandled";
      },
    });
    expect(panel.blocks.removeBlocks(["one", "two"])).toBe(true);
    expect(calls).toEqual(["one", "one", "two"]);
    expect(editor.blocks.getRootIds()).toEqual([]);
    editor.history.undo();
    expect(editor.blocks.getRootIds()).toEqual(["one", "two"]);
  } finally {
    await editor.destroy();
  }
});

test("stops resolving outline behaviors after a higher-priority rejection", async () => {
  const editor = await createTestEditor();
  const panel = new ChildrenPanel(editor);
  try {
    editor.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    });
    editor.blockRegistry.registerBehavior(
      {
        isAvailable: () => true,
        onChildIndent: () => "rejected",
      },
      10,
    );
    editor.blockRegistry.registerBehavior({
      isAvailable: () => {
        throw new Error("lower-priority behavior must not be inspected");
      },
      onChildIndent: () => "unhandled",
    });
    expect(panel.blocks.indentBlocks(["child"])).toBe(true);
    expect(editor.blocks.getParentId("child")).toBe("parent");
  } finally {
    await editor.destroy();
  }
});

test("does not recheck deletion applicability after a behavior has handled one selected block", async () => {
  const editor = await createTestEditor();
  const panel = new ChildrenPanel(editor);
  try {
    editor.blocks.insertBlock({ id: "one", type: "paragraph" });
    editor.blocks.insertBlock({ id: "two", type: "paragraph" });
    const checked: string[] = [];
    editor.blockRegistry.registerBehavior({
      isAvailable: (block) => {
        checked.push(block.id!);
        return true;
      },
      onStructuralDelete: () => "unhandled",
    });
    expect(panel.blocks.removeBlocks(["one", "two"])).toBe(true);
    expect(checked).toEqual(["one"]);
  } finally {
    await editor.destroy();
  }
});

test("document block moves apply registered permissions without a separate check", async () => {
  const editor = await createTestEditor();
  try {
    editor.blocks.insertBlock({ id: "source", type: "paragraph" });
    editor.blocks.insertBlock({ id: "parent", type: "paragraph" });
    let allow = false;
    editor.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "parent",
      canMove: () => allow,
    });
    editor.blocks.moveBlocks(["source"], "parent", "inside");
    expect(editor.blocks.getParentId("source")).toBeNull();
    allow = true;
    editor.blocks.moveBlocks(["source"], "parent", "inside");
    expect(editor.blocks.getParentId("source")).toBe("parent");
    editor.history.undo();
    expect(editor.blocks.getParentId("source")).toBeNull();
  } finally {
    await editor.destroy();
  }
});

test("document outline operations automatically apply registered behavior", async () => {
  const editor = await createTestEditor();
  try {
    editor.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [
        { id: "one", type: "paragraph" },
        { id: "two", type: "paragraph" },
      ],
    });
    let allow = false;
    editor.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "parent",
      onChildIndent: (context) => {
        expect(context.blocks).toBe(editor.blocks);
        return allow ? "unhandled" : "rejected";
      },
    });
    editor.blocks.indentBlocks(["two"]);
    expect(editor.blocks.getParentId("two")).toBe("parent");
    allow = true;
    editor.blocks.indentBlocks(["two"]);
    expect(editor.blocks.getParentId("two")).toBe("one");
    editor.history.undo();
    expect(editor.blocks.getParentId("two")).toBe("parent");
  } finally {
    await editor.destroy();
  }
});
