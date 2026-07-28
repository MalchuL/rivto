import * as Y from "yjs";
import { YjsDoc } from "../../../crdt-doc";
import { DocumentModelImpl } from "../document-model";
import type { BlockInput, BlockPatch } from "../types";

const exchangeUpdates = (left: YjsDoc, right: YjsDoc): void => {
  const leftState = Y.encodeStateAsUpdate(left.doc);
  const rightState = Y.encodeStateAsUpdate(right.doc);
  Y.applyUpdate(left.doc, rightState);
  Y.applyUpdate(right.doc, leftState);
};

describe("DocumentModelImpl schema v4 Markdown storage", () => {
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
    expect(modelA.document[0].props).toEqual({ url: "new.png", width: 600 });
    expect(modelA.document[0].pluginData).toEqual({
      "acme.review": { status: "approved" },
      "rivto.comments": { threadIds: ["thread-1"] },
    });
    expect(modelA.document[0].content).toBe("Hi Hello Alice");

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

    expect(model.document.map((block) => block.id)).toEqual(["target"]);
    expect(model.links).toEqual([]);
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

    expect(model.document[0].content).toBe("**Bold!** plain");
    doc.destroy();
  });

  it("requires native types and never changes them through patches", () => {
    const doc = new YjsDoc("canonical-types");
    const model = new DocumentModelImpl(doc);

    expect(() => model.insertBlock({ id: "missing" } as BlockInput)).toThrow("Block type is required");
    model.insertBlock({ id: "custom", type: "acme.chart" });
    model.updateBlock("custom", { type: "paragraph" } as unknown as BlockPatch);

    expect(model.document[0].type).toBe("acme.chart");
    doc.destroy();
  });
});
