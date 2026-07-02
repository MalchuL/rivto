import * as Y from "yjs";
import { YjsDoc } from "../../../crdt-doc";
import { DocumentModelImpl } from "../document-model";

const exchangeUpdates = (left: YjsDoc, right: YjsDoc): void => {
  const leftState = Y.encodeStateAsUpdate(left.doc);
  const rightState = Y.encodeStateAsUpdate(right.doc);
  Y.applyUpdate(left.doc, rightState);
  Y.applyUpdate(right.doc, leftState);
};

describe("DocumentModelImpl schema v2", () => {
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
    expect(modelA.document[0].content.map((run) => run.text).join("")).toBe("Hi Hello Alice");

    docA.destroy();
    docB.destroy();
  });

  it("removes descendant links when deleting a block tree", () => {
    const doc = new YjsDoc("canonical-tree");
    const model = new DocumentModelImpl("canonical-tree", doc);

    model.insertBlock({ id: "parent", children: [{ id: "child", content: "Nested" }] });
    model.insertBlock({ id: "target" });
    model.createLink({ id: "child-target", from: { blockId: "child" }, to: { blockId: "target" } });
    model.removeBlock("parent");

    expect(model.document.map((block) => block.id)).toEqual(["target"]);
    expect(model.links).toEqual([]);
    doc.destroy();
  });

  it("preserves unchanged rich-text marks during plain-text reconciliation", () => {
    const doc = new YjsDoc("canonical-rich-text");
    const model = new DocumentModelImpl(doc);
    model.insertBlock({
      id: "text",
      content: [
        { text: "Bold", marks: { bold: true } },
        { text: " plain" },
      ],
    });

    model.setBlockText("text", "Bold! plain");

    expect(model.document[0].content).toEqual([
      { text: "Bold!", marks: { bold: true } },
      { text: " plain", marks: undefined },
    ]);
    doc.destroy();
  });
});
