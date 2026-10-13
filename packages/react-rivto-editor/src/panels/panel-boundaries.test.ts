import { ReactPanel } from "./react-panel";
import { createCaretSelection, createStructuralSelection } from "@chulane/rivto";
import { convertLeafToContainer } from "../block-behaviors/ops/outline-ops";
import { createReactEditor } from "../editor/react-editor";
import { createTestCoreEditor } from "../test-utils";
import { ChildrenPanel } from "@chulane/rivto";
import { EmbeddingPanel } from "@chulane/rivto";

async function fixture() {
  const document = await createTestCoreEditor();
  document.blocks.insertBlock({ id: "outside", type: "paragraph" });
  document.blocks.insertBlock({ id: "root", type: "paragraph", content: "Root", children: [
    { id: "a", type: "paragraph" }, { id: "b", type: "paragraph" },
  ] });
  const shape = { type: "shape", zIndex: 0, frame: { x: 0, y: 0, width: 10, height: 10 } };
  document.elements.insertElement({ ...shape, id: "container", children: [{ ...shape, id: "inside" }] });
  document.elements.insertElement({ ...shape, id: "outside-element" });
  const editor = createReactEditor({ editor: document });
  const children = new ReactPanel(editor, new ChildrenPanel(editor, { rootBlockId: "root", rootElementId: "container" }), {  });
  const embedding = new ReactPanel(editor, new EmbeddingPanel(editor, { rootBlockId: "root", rootElementId: "container" }), {  });
  return { document, children, embedding, close: async () => { editor.destroy(); await document.destroy(); } };
}

test("panel roots and parents are relative while document hierarchy stays absolute", async () => {
  const f = await fixture();
  expect(f.children.blocks.getRootIds()).toEqual(["a", "b"]);
  expect(f.embedding.blocks.getRootIds()).toEqual(["root"]);
  expect(f.children.blocks.getBlockNode("root")).toBeUndefined();
  expect(f.children.blocks.getParentId("a")).toBeNull();
  expect(f.embedding.blocks.getParentId("a")).toBe("root");
  expect(f.embedding.blocks.getParentId("root")).toBeNull();
  expect(f.document.blocks.getParentId("a")).toBe("root");
  for (const reactPanel of [f.children, f.embedding]) {
    expect(reactPanel.elements.getRootIds()).toContain("inside");
    expect(reactPanel.elements.getParentId("inside")).toBeNull();
    expect(reactPanel.elements.getElementNode("container")).toBeUndefined();
    expect(reactPanel.elements.getElementNode("outside-element")).toBeUndefined();
    const inserted = reactPanel.elements.insertElement({ type: "shape", zIndex: 1, frame: { x: 0, y: 0, width: 10, height: 10 } });
    expect(f.document.elements.getParentId(inserted.id)).toBe("container");
  }
  await f.close();
});

test("rejects outside targets and protected root operations before any batch mutation", async () => {
  const f = await fixture();
  const before = f.document.dump();
  expect(() => f.children.blocks.updateBlocks([{ id: "a", patch: { content: "changed" } }, { id: "outside", patch: { content: "bad" } }])).toThrow();
  expect(() => f.embedding.blocks.removeBlocks(["a", "root"])).toThrow();
  expect(() => f.embedding.blocks.moveBlocks(["a", "root"], "b")).toThrow();
  expect(() => f.embedding.blocks.mergeBlocks("a", "root")).toThrow();
  expect(() => f.children.blocks.outdentBlocks(["a", "b"])).toThrow();
  expect(() => f.children.blocks.insertBlock({ type: "paragraph" }, { parentId: "outside" })).toThrow();
  expect(() => f.children.elements.updateElements([{ id: "inside", patch: { zIndex: 5 } }, { id: "outside-element", patch: { zIndex: 6 } }])).toThrow();
  expect(() => f.children.elements.moveElements(["inside"], { root: true, beforeId: "outside-element" })).toThrow();
  expect(() => f.children.elements.removeElements(["inside", "container"])).toThrow();
  expect(f.document.dump()).toEqual(before);
  f.embedding.blocks.updateBlock("root", { content: "Editable root" });
  f.embedding.selection.set(createStructuralSelection(["root"]));
  expect(f.embedding.clipboard.copy()?.blocks[0]?.content).toBe("Editable root");
  f.embedding.selection.delete();
  expect(f.document.blocks.hasBlock("root")).toBe(true);
  f.embedding.selection.set(createCaretSelection("root", 0));
  await f.close();
});

test("direct insertion into an empty panel is observed only under its real parent and is undoable", async () => {
  const f = await fixture();
  f.children.blocks.removeBlocks(["a", "b"]);
  f.document.history.clear();
  const parents: (string | null | undefined)[] = [];
  const stop = f.document.blocks.subscribeStructure(() => {
    if (f.document.blocks.hasBlock("new")) parents.push(f.document.blocks.getParentId("new"));
  });
  f.children.blocks.insertBlock({ id: "new", type: "paragraph" });
  expect(parents.length).toBeGreaterThan(0);
  expect(parents.every(parent => parent === "root")).toBe(true);
  expect(f.document.blocks.getRootIds()).toEqual(["outside", "root"]);
  f.document.history.undo();
  expect(f.children.blocks.getRootIds()).toEqual([]);
  f.document.history.redo();
  expect(f.children.blocks.getRootIds()).toEqual(["new"]);
  stop(); await f.close();
});

test("paste keeps protected root text editable and inserts following lines inside the embedding", async () => {
  const f = await fixture();
  const before = f.document.dump();
  expect(() => f.embedding.clipboard.paste({ text: "bad", defaultBlockType: "paragraph", placement: { afterId: "outside" } })).toThrow();
  expect(() => f.children.clipboard.paste({ text: "bad", defaultBlockType: "paragraph", textTarget: createCaretSelection("outside", 0) })).toThrow();
  expect(f.document.dump()).toEqual(before);
  f.embedding.clipboard.paste({ text: "First\nSecond", defaultBlockType: "paragraph", textTarget: createCaretSelection("root", 4) });
  expect(f.document.blocks.getBlockNode("root")?.content).toBe("RootFirst");
  expect(f.document.blocks.getRootIds()).toEqual(["outside", "root"]);
  expect(f.document.blocks.getBlock("root")?.children[0]?.content).toBe("Second");
  await f.close();
});

test("prepending a nested block keeps its sibling list and the protected root cannot be cut", async () => {
  const f = await fixture();
  f.embedding.blocks.insertBlock({ id: "grandchild", type: "paragraph" }, { parentId: "a" });
  f.embedding.blocks.insertBlock({ id: "second-grandchild", type: "paragraph" }, { parentId: "a" });
  f.embedding.blocks.moveBlock("second-grandchild", null);
  expect(f.document.blocks.getChildIds("a")).toEqual(["second-grandchild", "grandchild"]);
  expect(f.document.blocks.getParentId("second-grandchild")).toBe("a");
  f.embedding.selection.set(createStructuralSelection(["root"]));
  f.embedding.clipboard.cut();
  expect(f.document.blocks.getBlockNode("root")?.content).toBe("Root");
  await f.close();
});

test("container conversion preserves the protected root identity without a sibling insertion", async () => {
  const f = await fixture();
  f.embedding.blocks.removeBlocks(["a", "b"]);
  f.document.blockRegistry.defineBlock({ type: "container" });
  f.document.history.clear();
  convertLeafToContainer(f.embedding, "root", { type: "container", children: [{ id: "shell", type: "paragraph" }] });
  expect(f.document.blocks.getRootIds()).toEqual(["outside", "root"]);
  expect(f.embedding.blocks.getBlock("root")).toMatchObject({ id: "root", type: "container", content: "Root", children: [{ id: "shell" }] });
  f.document.history.undo();
  expect(f.embedding.blocks.getBlock("root")).toMatchObject({ id: "root", type: "paragraph", children: [] });
  await f.close();
});
