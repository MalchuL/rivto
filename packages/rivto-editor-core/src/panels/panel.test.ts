import { ChildrenPanel } from "./children-panel";
import { EmbeddingPanel } from "./embedding-panel";
import { createTestEditor } from "../editor/test-utils";

it("edits independent block and element subtrees without React and preserves root protection", async () => {
  const editor = await createTestEditor();
  editor.blocks.insertBlock({
    id: "root",
    type: "paragraph",
    children: [{ id: "child", type: "paragraph" }],
  });
  const frame = { x: 0, y: 0, width: 10, height: 10 };
  editor.elements.insertElement({
    id: "container",
    type: "group",
    frame,
    zIndex: 0,
    children: [{ id: "inside", type: "shape", frame, zIndex: 0 }],
  });
  editor.elements.insertElement({ id: "outside", type: "shape", frame, zIndex: 0 });
  const panel = new ChildrenPanel(editor, { rootBlockId: "root", rootElementId: "container" });
  const embed = new EmbeddingPanel(editor, { rootBlockId: "root" });
  expect(panel.blocks.getRootIds()).toEqual(["child"]);
  expect(embed.blocks.getRootIds()).toEqual(["root"]);
  expect(embed.blocks.canRemove("root")).toBe(false);
  expect(panel.elements.getRootIds()).toEqual(["inside"]);
  expect(panel.elements.getElementNode("outside")).toBeUndefined();
  expect(() => panel.elements.updateElement("outside", { frame: { x: 20 } })).toThrow();
  editor.history.clear();
  panel.elements.updateElement("inside", { frame: { x: 30 } });
  editor.history.undo();
  expect(panel.elements.getElementNode("inside")?.frame.x).toBe(0);
  expect(new ChildrenPanel(editor).blocks.getRootIds()).toEqual(["root"]);
  await editor.destroy();
});

it.each(["children", "embedding"] as const)(
  "shares document history for %s panel batches and excludes maintenance writes",
  async (kind) => {
    const editor = await createTestEditor();
    editor.blocks.insertBlock({
      id: "root",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph", content: "before" }],
    });
    editor.elements.insertElement({
      id: "element",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    });
    const panel =
      kind === "children"
        ? new ChildrenPanel(editor, { rootBlockId: "root" })
        : new EmbeddingPanel(editor, { rootBlockId: "root" });
    const other = new ChildrenPanel(editor);
    editor.history.clear();
    try {
      const result = panel.batchUpdates(() => {
        panel.blocks.updateBlock("child", { content: "after" });
        return other.batchUpdates(() => {
          panel.elements.updateElement("element", { frame: { x: 30 } });
          return "result";
        });
      });
      expect(result).toBe("result");
      expect(
        panel.batchUpdatesWithoutHistory(() => {
          panel.blocks.setBlockPluginData("child", "maintenance", { value: 1 });
          return 42;
        }),
      ).toBe(42);
      other.document.history.undo();
      expect(panel.blocks.getBlockNode("child")?.content).toBe("before");
      expect(panel.elements.getElementNode("element")?.frame.x).toBe(0);
      expect(panel.blocks.getBlockNode("child")?.pluginData.maintenance).toEqual({ value: 1 });
      editor.history.redo();
      expect(panel.blocks.getBlockNode("child")?.content).toBe("after");
      expect(panel.elements.getElementNode("element")?.frame.x).toBe(30);
      const failure = new Error("callback failure");
      for (const method of ["batchUpdates", "batchUpdatesWithoutHistory"] as const) {
        expect(() =>
          panel[method](() => {
            throw failure;
          }),
        ).toThrow(failure);
        expect(panel[method](() => "still usable")).toBe("still usable");
      }
    } finally {
      await editor.destroy();
    }
  },
);

it.each(["children", "embedding"] as const)(
  "forwards the document change stream and cleanup for a %s panel",
  async (kind) => {
    const editor = await createTestEditor();
    editor.blocks.insertBlock({
      id: "root",
      type: "paragraph",
      children: [{ id: "inside", type: "paragraph" }],
    });
    editor.blocks.insertBlock({ id: "outside", type: "paragraph" });
    const panel =
      kind === "children"
        ? new ChildrenPanel(editor, { rootBlockId: "root" })
        : new EmbeddingPanel(editor, { rootBlockId: "root" });
    const documentSnapshots: number[] = [];
    const panelSnapshots: number[] = [];
    const stopDocument = editor.subscribe(() => documentSnapshots.push(editor.revision));
    const stopPanel = panel.subscribe(() => panelSnapshots.push(editor.revision));
    try {
      expect(panelSnapshots).toEqual([]);
      panel.blocks.updateBlock("inside", { content: "inside edit" });
      const beforeOutside = panelSnapshots.length;
      editor.blocks.updateBlock("outside", { content: "outside edit" });
      expect(panelSnapshots.length).toBeGreaterThan(beforeOutside);
      expect(panel.blocks.getBlockNode("outside")).toBeUndefined();
      editor.history.undo();
      editor.history.redo();
      expect(panelSnapshots).toEqual(documentSnapshots);
      stopPanel();
      const beforeCleanup = panelSnapshots.length;
      panel.blocks.updateBlock("inside", { content: "after unsubscribe" });
      expect(panelSnapshots).toHaveLength(beforeCleanup);
      expect(documentSnapshots.length).toBeGreaterThan(beforeCleanup);
    } finally {
      stopPanel();
      stopDocument();
      await editor.destroy();
    }
  },
);
