import * as Y from "yjs";
import { YjsDoc } from "../../../crdt-doc";
import { UndoManager } from "../../../../managers/undo-manager";
import { DocumentModelImpl } from "../document-model";
import type { BlockInput, BlockPatch } from "../types";

const exchangeUpdates = (left: YjsDoc, right: YjsDoc): void => {
  const leftState = Y.encodeStateAsUpdate(left.doc);
  const rightState = Y.encodeStateAsUpdate(right.doc);
  Y.applyUpdate(left.doc, rightState);
  Y.applyUpdate(right.doc, leftState);
};

describe("DocumentModelImpl schema v4 Markdown storage", () => {
  it("loads, removes, and recreates blocks around a valid empty document", () => {
    const doc = new YjsDoc("empty-document");
    const model = new DocumentModelImpl(doc);

    expect(model.getBlocks()).toEqual([]);
    expect(model.getRootIds()).toEqual([]);
    expect(model.getVisibleBlockIds()).toEqual([]);
    expect(model.getLinks()).toEqual([]);

    model.loadSnapshot({ version: 4, blocks: [], links: [] });
    const id = model.insertBlock({ id: "only", type: "paragraph", content: "Only" });
    model.createLink({ id: "self", from: { blockId: id }, to: { blockId: id } });
    model.removeBlock(id);

    expect(model.getBlocks()).toEqual([]);
    expect(model.getRootIds()).toEqual([]);
    expect(model.getVisibleBlockIds()).toEqual([]);
    expect(model.getLinks()).toEqual([]);
    expect(model.getSnapshot()).toMatchObject({ version: 4, blocks: [], links: [] });
    expect(model.insertBlock({ id: "later", type: "paragraph" })).toBe("later");
    doc.destroy();
  });

  it("converges when a remote client removes the final block", () => {
    const docA = new YjsDoc("empty-remote-a");
    const docB = new YjsDoc("empty-remote-b");
    const modelA = new DocumentModelImpl(docA);
    const modelB = new DocumentModelImpl(docB);
    modelA.insertBlock({ id: "only", type: "paragraph" });
    exchangeUpdates(docA, docB);

    modelB.removeBlock("only");
    exchangeUpdates(docA, docB);

    expect(modelA.getBlocks()).toEqual([]);
    expect(modelB.getBlocks()).toEqual([]);
    docA.destroy();
    docB.destroy();
  });

  it("lazily caches and repairs nested block paths", () => {
    const doc = new YjsDoc("lazy-paths");
    const model = new DocumentModelImpl(doc);
    model.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph", content: "Child" }],
    });
    model.insertBlock({ id: "target", type: "paragraph" });
    const findPath = jest.spyOn(model as unknown as {
      findPath(id: string): readonly number[] | undefined;
    }, "findPath");

    expect(model.getBlock("child")?.content).toBe("Child");
    expect(findPath).toHaveBeenCalledTimes(1);
    expect(model.getBlock("child")?.id).toBe("child");
    expect(findPath).toHaveBeenCalledTimes(1);

    model.moveBlock("child", "target", "inside");
    const searchesBeforeRepair = findPath.mock.calls.length;
    expect(model.getParentId("child")).toBe("target");
    expect(findPath).toHaveBeenCalledTimes(searchesBeforeRepair + 1);
    expect(model.getRootIds()).toEqual(["parent", "target"]);
    expect(model.getChildIds("target")).toEqual(["child"]);
    expect(model.getVisibleBlockIds()).toEqual(["parent", "target", "child"]);
    model.updateBlock("target", { collapsed: true });
    expect(model.getVisibleBlockIds()).toEqual(["parent", "target"]);
    model.updateBlock("target", { collapsed: false });

    model.removeBlock("child");
    expect(model.getBlock("child")).toBeUndefined();
    doc.destroy();
  });

  it("repairs cached paths after a remote structural update", () => {
    const docA = new YjsDoc("lazy-path-a");
    const docB = new YjsDoc("lazy-path-b");
    const modelA = new DocumentModelImpl(docA);
    const modelB = new DocumentModelImpl(docB);
    modelA.insertBlock({ id: "left", type: "paragraph" });
    modelA.insertBlock({ id: "child", type: "paragraph" }, "left");
    modelA.indentBlock("child");
    modelA.insertBlock({ id: "right", type: "paragraph" }, "left");
    Y.applyUpdate(docB.doc, Y.encodeStateAsUpdate(docA.doc));

    expect(modelA.getParentId("child")).toBe("left");
    modelB.moveBlock("child", "right", "inside");
    Y.applyUpdate(docA.doc, Y.encodeStateAsUpdate(docB.doc));

    expect(modelA.getParentId("child")).toBe("right");
    expect(modelA.getBlock("child")?.id).toBe("child");
    docA.destroy();
    docB.destroy();
  });

  it("repairs cached paths after indent, outdent, deletion, undo, and redo", () => {
    const doc = new YjsDoc("lazy-path-history");
    const model = new DocumentModelImpl(doc);
    model.insertBlock({ id: "parent", type: "paragraph" });
    model.insertBlock({ id: "child", type: "paragraph" }, "parent");
    const history = new UndoManager(model);
    history.clear();

    expect(model.getParentId("child")).toBeNull();
    model.indentBlock("child");
    expect(model.getParentId("child")).toBe("parent");
    model.outdentBlock("child");
    expect(model.getParentId("child")).toBeNull();

    history.clear();
    model.moveBlock("child", "parent", "inside");
    expect(model.getParentId("child")).toBe("parent");
    history.undo();
    expect(model.getParentId("child")).toBeNull();
    history.redo();
    expect(model.getParentId("child")).toBe("parent");

    history.clear();
    model.removeBlock("child");
    expect(model.getBlock("child")).toBeUndefined();
    history.undo();
    expect(model.getParentId("child")).toBe("parent");

    history.destroy();
    doc.destroy();
  });

  it("provides direct block and link getters", () => {
    const doc = new YjsDoc("direct-getters");
    const model = new DocumentModelImpl(doc);
    model.insertBlock({ id: "from", type: "paragraph" });
    model.insertBlock({ id: "to", type: "paragraph" });
    model.createLink({ id: "edge", from: { blockId: "from" }, to: { blockId: "to" } });

    expect(model.getBlocks().map((block) => block.id)).toEqual(["from", "to"]);
    expect(model.getLink("edge")).toEqual({
      id: "edge",
      from: { blockId: "from" },
      to: { blockId: "to" },
      meta: {},
    });
    expect(model.getLinks()).toEqual([model.getLink("edge")]);
    doc.destroy();
  });

  it("merges concurrent property, plugin namespace, and text operations", () => {
    const docA = new YjsDoc("canonical-a");
    const docB = new YjsDoc("canonical-b");
    const modelA = new DocumentModelImpl(docA);
    const modelB = new DocumentModelImpl(docB);

    modelA.insertBlock({ id: "image", type: "image", content: "Hello", props: { url: "old.png", width: 300 } });
    Y.applyUpdate(docB.doc, Y.encodeStateAsUpdate(docA.doc));

    modelA.setBlockProp("image", "width", 600);
    modelA.setPluginData("image", "rivto.comments", { threadIds: ["thread-1"] });
    modelA.insertText("image", 5, " Alice");

    modelB.setBlockProp("image", "url", "new.png");
    modelB.setPluginData("image", "acme.review", { status: "approved" });
    modelB.insertText("image", 0, "Hi ");

    exchangeUpdates(docA, docB);

    expect(modelA.getSnapshot()).toEqual(modelB.getSnapshot());
    expect(modelA.getBlocks()[0].props).toEqual({ url: "new.png", width: 600 });
    expect(modelA.getBlocks()[0].pluginData).toEqual({
      "acme.review": { status: "approved" },
      "rivto.comments": { threadIds: ["thread-1"] },
    });
    expect(modelA.getBlocks()[0].content).toBe("Hi Hello Alice");

    docA.destroy();
    docB.destroy();
  });

  it("removes descendant links when deleting a block tree", () => {
    const doc = new YjsDoc("canonical-tree");
    const model = new DocumentModelImpl("canonical-tree", doc);

    model.insertBlock({ id: "parent", type: "group", children: [{ id: "child", type: "paragraph", content: "Nested" }] });
    model.insertBlock({ id: "target", type: "paragraph" });
    model.createLink({ id: "child-target", from: { blockId: "child" }, to: { blockId: "target" } });
    model.removeBlock("parent");

    expect(model.getBlocks().map((block) => block.id)).toEqual(["target"]);
    expect(model.getLinks()).toEqual([]);
    doc.destroy();
  });

  it("stores Markdown syntax as plain collaborative text", () => {
    const doc = new YjsDoc("canonical-rich-text");
    const model = new DocumentModelImpl(doc);
    model.insertBlock({
      id: "text",
      type: "paragraph",
      content: "**Bold** plain",
    });

    model.setBlockText("text", "**Bold!** plain");

    expect(model.getBlocks()[0].content).toBe("**Bold!** plain");
    doc.destroy();
  });

  it("requires native types and never changes them through patches", () => {
    const doc = new YjsDoc("canonical-types");
    const model = new DocumentModelImpl(doc);

    expect(() => model.insertBlock({ id: "missing" } as BlockInput)).toThrow("Block type is required");
    model.insertBlock({ id: "custom", type: "acme.chart" });
    model.updateBlock("custom", { type: "paragraph" } as unknown as BlockPatch);

    expect(model.getBlocks()[0].type).toBe("acme.chart");
    doc.destroy();
  });
});
