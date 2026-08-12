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

describe("DocumentModelImpl schema v6 Markdown storage", () => {
  it("loads, removes, and recreates blocks around a valid empty document", () => {
    const doc = new YjsDoc("empty-document");
    const model = new DocumentModelImpl(doc);

    expect("getBlocks" in model).toBe(false);
    expect("createLink" in model).toBe(false);
    expect(model.blocks.getBlocks()).toEqual([]);
    expect(model.blocks.getRootIds()).toEqual([]);
    expect(model.links.getLinks()).toEqual([]);

    model.loadSnapshot({ version: 6, blocks: [], links: [] });
    const id = model.blocks.insertBlock({ id: "only", type: "paragraph", content: "Only" });
    model.links.createLink({ id: "self", from: { blockId: id }, to: { blockId: id } });
    model.blocks.removeBlock(id);

    expect(model.blocks.getBlocks()).toEqual([]);
    expect(model.blocks.getRootIds()).toEqual([]);
    expect(model.links.getLinks()).toEqual([]);
    expect(model.getSnapshot()).toMatchObject({ version: 6, blocks: [], links: [] });
    expect(model.blocks.insertBlock({ id: "later", type: "paragraph" })).toBe("later");
    doc.destroy();
  });

  it("round-trips opaque list state in schema v6", () => {
    const sourceDoc = new YjsDoc("list-snapshot-source");
    const source = new DocumentModelImpl(sourceDoc);
    source.loadSnapshot({
      version: 6,
      blocks: [{
        id: "listed",
        type: "paragraph",
        listProps: { collapsed: false, type: "checkbox", checked: true },
        props: {},
        pluginData: {},
        content: "Task",
        children: [],
      }],
      links: [],
    });
    expect(source.blocks.getBlock("listed")?.listProps).toEqual({ collapsed: false, type: "checkbox", checked: true });

    const targetDoc = new YjsDoc("list-snapshot-target");
    const target = new DocumentModelImpl(targetDoc);
    target.loadSnapshot(source.getSnapshot());
    expect(target.blocks.getBlock("listed")?.listProps).toEqual({ collapsed: false, type: "checkbox", checked: true });
    sourceDoc.destroy();
    targetDoc.destroy();
  });

  it("round-trips and collaboratively merges first-class elements without block layout", () => {
    const sourceDoc = new YjsDoc("element-snapshot-source");
    const source = new DocumentModelImpl(sourceDoc);
    source.blocks.insertBlock({ id: "content", type: "paragraph", content: "Card" });
    source.elements.insertElement({
      id: "card",
      type: "block",
      frame: { x: -20, y: 30, width: 320, height: 140 },
      zIndex: 2,
      props: { startBlockId: "content", endBlockId: "content" },
    });
    const snapshot = source.getSnapshot();
    expect(snapshot.version).toBe(6);
    expect(snapshot.elements).toEqual([expect.objectContaining({ id: "card", type: "block" })]);
    expect(snapshot.blocks[0]).not.toHaveProperty("layout");

    const targetDoc = new YjsDoc("element-snapshot-target");
    const target = new DocumentModelImpl(targetDoc);
    target.loadSnapshot(snapshot);
    expect(target.getSnapshot()).toEqual(snapshot);
    targetDoc.destroy();

    const peerDoc = new YjsDoc("element-collaboration-peer");
    const peer = new DocumentModelImpl(peerDoc);
    Y.applyUpdate(peerDoc.doc, Y.encodeStateAsUpdate(sourceDoc.doc));
    peer.elements.updateElement("card", { frame: { x: 80 }, props: { title: "Shared" } });
    Y.applyUpdate(sourceDoc.doc, Y.encodeStateAsUpdate(peerDoc.doc));
    expect(source.elements.getElement("card")).toEqual(peer.elements.getElement("card"));
    expect(source.elements.getElement("card")).toMatchObject({
      frame: { x: 80 },
      props: { startBlockId: "content", endBlockId: "content", title: "Shared" },
    });
    sourceDoc.destroy();
    peerDoc.destroy();
  });

  it("converges when a remote client removes the final block", () => {
    const docA = new YjsDoc("empty-remote-a");
    const docB = new YjsDoc("empty-remote-b");
    const modelA = new DocumentModelImpl(docA);
    const modelB = new DocumentModelImpl(docB);
    modelA.blocks.insertBlock({ id: "only", type: "paragraph" });
    exchangeUpdates(docA, docB);

    modelB.blocks.removeBlock("only");
    exchangeUpdates(docA, docB);

    expect(modelA.blocks.getBlocks()).toEqual([]);
    expect(modelB.blocks.getBlocks()).toEqual([]);
    docA.destroy();
    docB.destroy();
  });

  it("lazily caches and repairs nested block paths", () => {
    const doc = new YjsDoc("lazy-paths");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph", content: "Child" }],
    });
    model.blocks.insertBlock({ id: "target", type: "paragraph" });
    const blockManager = model.blocks as unknown as {
      findPath(id: string): readonly number[] | undefined;
    };
    const findPath = jest.spyOn(blockManager, "findPath");

    expect(model.blocks.getBlock("child")?.content).toBe("Child");
    expect(findPath).toHaveBeenCalledTimes(1);
    expect(model.blocks.getBlock("child")?.id).toBe("child");
    expect(findPath).toHaveBeenCalledTimes(1);

    model.blocks.moveBlock("child", "target", "inside");
    const searchesBeforeRepair = findPath.mock.calls.length;
    expect(model.blocks.getParentId("child")).toBe("target");
    expect(findPath).toHaveBeenCalledTimes(searchesBeforeRepair + 1);
    expect(model.blocks.getRootIds()).toEqual(["parent", "target"]);
    expect(model.blocks.getChildIds("target")).toEqual(["child"]);
    model.blocks.updateBlock("target", { listProps: { collapsed: true } });
    expect(model.blocks.getBlock("target")?.listProps.collapsed).toBe(true);
    model.blocks.updateBlock("target", { listProps: { collapsed: false } });

    model.blocks.removeBlock("child");
    expect(model.blocks.getBlock("child")).toBeUndefined();
    doc.destroy();
  });

  it("repairs cached paths after a remote structural update", () => {
    const docA = new YjsDoc("lazy-path-a");
    const docB = new YjsDoc("lazy-path-b");
    const modelA = new DocumentModelImpl(docA);
    const modelB = new DocumentModelImpl(docB);
    modelA.blocks.insertBlock({ id: "left", type: "paragraph" });
    modelA.blocks.insertBlock({ id: "child", type: "paragraph" }, "left");
    modelA.blocks.indentBlock("child");
    modelA.blocks.insertBlock({ id: "right", type: "paragraph" }, "left");
    Y.applyUpdate(docB.doc, Y.encodeStateAsUpdate(docA.doc));

    expect(modelA.blocks.getParentId("child")).toBe("left");
    modelB.blocks.moveBlock("child", "right", "inside");
    Y.applyUpdate(docA.doc, Y.encodeStateAsUpdate(docB.doc));

    expect(modelA.blocks.getParentId("child")).toBe("right");
    expect(modelA.blocks.getBlock("child")?.id).toBe("child");
    docA.destroy();
    docB.destroy();
  });

  it("repairs cached paths after indent, outdent, deletion, undo, and redo", () => {
    const doc = new YjsDoc("lazy-path-history");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "parent", type: "paragraph" });
    model.blocks.insertBlock({ id: "child", type: "paragraph" }, "parent");
    const history = new UndoManager(model);
    history.clear();

    expect(model.blocks.getParentId("child")).toBeNull();
    model.blocks.indentBlock("child");
    expect(model.blocks.getParentId("child")).toBe("parent");
    model.blocks.outdentBlock("child");
    expect(model.blocks.getParentId("child")).toBeNull();

    history.clear();
    model.blocks.moveBlock("child", "parent", "inside");
    expect(model.blocks.getParentId("child")).toBe("parent");
    history.undo();
    expect(model.blocks.getParentId("child")).toBeNull();
    history.redo();
    expect(model.blocks.getParentId("child")).toBe("parent");

    history.clear();
    model.blocks.removeBlock("child");
    expect(model.blocks.getBlock("child")).toBeUndefined();
    history.undo();
    expect(model.blocks.getParentId("child")).toBe("parent");

    history.destroy();
    doc.destroy();
  });

  it("provides direct block and link getters", () => {
    const doc = new YjsDoc("direct-getters");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "from", type: "paragraph" });
    model.blocks.insertBlock({ id: "to", type: "paragraph" });
    model.links.createLink({ id: "edge", from: { blockId: "from" }, to: { blockId: "to" } });

    expect(model.blocks.getBlocks().map((block) => block.id)).toEqual(["from", "to"]);
    expect(model.links.getLink("edge")).toEqual({
      id: "edge",
      from: { blockId: "from" },
      to: { blockId: "to" },
      meta: {},
    });
    expect(model.links.getLinks()).toEqual([model.links.getLink("edge")]);
    doc.destroy();
  });

  it("merges concurrent property, plugin namespace, and text operations", () => {
    const docA = new YjsDoc("canonical-a");
    const docB = new YjsDoc("canonical-b");
    const modelA = new DocumentModelImpl(docA);
    const modelB = new DocumentModelImpl(docB);

    modelA.blocks.insertBlock({ id: "image", type: "image", content: "Hello", props: { url: "old.png", width: 300 } });
    Y.applyUpdate(docB.doc, Y.encodeStateAsUpdate(docA.doc));

    modelA.blocks.setBlockProp("image", "width", 600);
    modelA.blocks.setPluginData("image", "rivto.comments", { threadIds: ["thread-1"] });
    modelA.blocks.insertText("image", 5, " Alice");

    modelB.blocks.setBlockProp("image", "url", "new.png");
    modelB.blocks.setPluginData("image", "acme.review", { status: "approved" });
    modelB.blocks.insertText("image", 0, "Hi ");

    exchangeUpdates(docA, docB);

    expect(modelA.getSnapshot()).toEqual(modelB.getSnapshot());
    expect(modelA.blocks.getBlocks()[0].props).toEqual({ url: "new.png", width: 600 });
    expect(modelA.blocks.getBlocks()[0].pluginData).toEqual({
      "acme.review": { status: "approved" },
      "rivto.comments": { threadIds: ["thread-1"] },
    });
    expect(modelA.blocks.getBlocks()[0].content).toBe("Hi Hello Alice");

    docA.destroy();
    docB.destroy();
  });

  it("removes descendant links when deleting a block tree", () => {
    const doc = new YjsDoc("canonical-tree");
    const model = new DocumentModelImpl("canonical-tree", doc);

    model.blocks.insertBlock({ id: "parent", type: "group", children: [{ id: "child", type: "paragraph", content: "Nested" }] });
    model.blocks.insertBlock({ id: "target", type: "paragraph" });
    model.links.createLink({ id: "child-target", from: { blockId: "child" }, to: { blockId: "target" } });
    model.blocks.removeBlock("parent");

    expect(model.blocks.getBlocks().map((block) => block.id)).toEqual(["target"]);
    expect(model.links.getLinks()).toEqual([]);
    doc.destroy();
  });

  it("stores Markdown syntax as plain collaborative text", () => {
    const doc = new YjsDoc("canonical-rich-text");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "text",
      type: "paragraph",
      content: "**Bold** plain",
    });

    model.blocks.setBlockText("text", "**Bold!** plain");

    expect(model.blocks.getBlocks()[0].content).toBe("**Bold!** plain");
    doc.destroy();
  });

  it("requires native types and never changes them through patches", () => {
    const doc = new YjsDoc("canonical-types");
    const model = new DocumentModelImpl(doc);

    expect(() => model.blocks.insertBlock({ id: "missing" } as BlockInput)).toThrow("Block type is required");
    model.blocks.insertBlock({ id: "custom", type: "acme.chart" });
    model.blocks.updateBlock("custom", { type: "paragraph" } as unknown as BlockPatch);

    expect(model.blocks.getBlocks()[0].type).toBe("acme.chart");
    doc.destroy();
  });
});
