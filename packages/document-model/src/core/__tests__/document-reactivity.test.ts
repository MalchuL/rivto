/**
 * Regression coverage for granular block and element observation.
 *
 * Stable snapshots are the contract consumed by React's external-store hooks:
 * unrelated mutations must retain identity while affected recursive values and
 * structural collections publish exactly where needed.
 */
import { YjsDoc } from "@chulane/crdt-doc";
import * as Y from "yjs";
import { DocumentModelImpl } from "../document-model";

describe("document reactivity", () => {
  test("invalidates a changed block and its ancestors but preserves siblings", () => {
    const doc = new YjsDoc("block-reactivity");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({
      id: "parent",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph", content: "before" }],
    });
    model.blocks.insertBlock({ id: "sibling", type: "paragraph" }, "parent");
    const parent = model.blocks.getBlock("parent");
    const sibling = model.blocks.getBlock("sibling");
    const roots = model.blocks.getRootIds();
    const calls = { parent: 0, child: 0, sibling: 0, roots: 0, structure: 0 };
    const disposers = [
      model.blocks.subscribeBlock("parent", () => { calls.parent += 1; }),
      model.blocks.subscribeBlock("child", () => { calls.child += 1; }),
      model.blocks.subscribeBlock("sibling", () => { calls.sibling += 1; }),
      model.blocks.subscribeRootIds(() => { calls.roots += 1; }),
      model.blocks.subscribeStructure(() => { calls.structure += 1; }),
    ];

    model.blocks.updateBlock("child", { content: "after" });

    expect(calls).toEqual({ parent: 1, child: 1, sibling: 0, roots: 0, structure: 0 });
    expect(model.blocks.getBlock("parent")).not.toBe(parent);
    expect(model.blocks.getBlock("sibling")).toBe(sibling);
    expect(model.blocks.getRootIds()).toBe(roots);
    disposers.forEach((dispose) => dispose());
    void doc.destroy();
  });

  test("separates hierarchy notifications from block property updates", () => {
    const doc = new YjsDoc("structure-reactivity");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "parent", type: "paragraph" });
    model.blocks.insertBlock({ id: "child", type: "paragraph" }, "parent");
    let structure = 0;
    let roots = 0;
    model.blocks.subscribeStructure(() => { structure += 1; });
    model.blocks.subscribeRootIds(() => { roots += 1; });

    model.blocks.updateBlock("parent", { listProps: { checked: true } });
    expect({ structure, roots }).toEqual({ structure: 0, roots: 0 });

    model.blocks.moveBlock("child", "parent", "inside");
    expect(structure).toBe(1);
    expect(roots).toBe(1);
    void doc.destroy();
  });

  test("reorders roots without invalidating their block snapshots", () => {
    const doc = new YjsDoc("root-reorder-reactivity");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "first", type: "paragraph" });
    model.blocks.insertBlock({ id: "second", type: "paragraph" }, "first");
    const first = model.blocks.getBlock("first");
    const second = model.blocks.getBlock("second");
    let blockChanges = 0;
    let rootChanges = 0;
    model.blocks.subscribeBlock("first", () => { blockChanges += 1; });
    model.blocks.subscribeBlock("second", () => { blockChanges += 1; });
    model.blocks.subscribeRootIds(() => { rootChanges += 1; });

    model.blocks.moveBlock("second", "first", "before");

    expect(model.blocks.getRootIds()).toEqual(["second", "first"]);
    expect(model.blocks.getBlock("first")).toBe(first);
    expect(model.blocks.getBlock("second")).toBe(second);
    expect({ blockChanges, rootChanges }).toEqual({ blockChanges: 0, rootChanges: 1 });
    void doc.destroy();
  });

  test("keeps element collection snapshots stable across block-only updates", () => {
    const doc = new YjsDoc("element-reactivity");
    const model = new DocumentModelImpl(doc);
    model.blocks.insertBlock({ id: "block", type: "paragraph" });
    model.elements.insertElement({
      id: "card",
      type: "block",
      frame: { x: 0, y: 0, width: 100, height: 100 },
      zIndex: 0,
    });
    const elements = model.elements.getElements();
    let changes = 0;
    model.elements.subscribe(() => { changes += 1; });

    model.blocks.updateBlock("block", { content: "changed" });
    expect(model.elements.getElements()).toBe(elements);
    expect(changes).toBe(0);

    model.elements.updateElement("card", { frame: { width: 120 } });
    expect(model.elements.getElements()).not.toBe(elements);
    expect(changes).toBe(1);
    void doc.destroy();
  });

  test("publishes focused snapshots for remote block updates", () => {
    const leftDoc = new YjsDoc("remote-left");
    const left = new DocumentModelImpl(leftDoc);
    left.blocks.insertBlock({ id: "remote", type: "paragraph", content: "before" });
    const rightDoc = new YjsDoc("remote-right");
    Y.applyUpdate(rightDoc.doc, Y.encodeStateAsUpdate(leftDoc.doc));
    const right = new DocumentModelImpl(rightDoc);
    const before = right.blocks.getBlock("remote");
    let calls = 0;
    right.blocks.subscribeBlock("remote", () => { calls += 1; });

    left.blocks.updateBlock("remote", { content: "after" });
    Y.applyUpdate(
      rightDoc.doc,
      Y.encodeStateAsUpdate(leftDoc.doc, Y.encodeStateVector(rightDoc.doc)),
    );

    expect(calls).toBe(1);
    expect(right.blocks.getBlock("remote")).not.toBe(before);
    expect(right.blocks.getBlock("remote")?.content).toBe("after");
    void leftDoc.destroy();
    void rightDoc.destroy();
  });
});
