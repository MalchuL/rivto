import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "../document-model";
import type { ElementInput } from "../types";

const shape = { type: "shape", frame: { x: 10, y: 20, width: 30, height: 40 }, zIndex: 0 };
const tree: ElementInput = {
  id: "group",
  type: "container",
  zIndex: 0,
  children: [
    { id: "inner", type: "container", zIndex: 0, children: [{ ...shape, id: "leaf" }] },
    { ...shape, id: "sibling" },
  ],
};

it("inserts a recursive tree, derives parent frames, and round-trips through flat snapshots and undo", async () => {
  const model = new DocumentModelImpl(new YjsDoc("element-tree"));
  model.history.clear();
  const inserted = model.elements.insertElement(tree);
  expect(inserted.children[0]!.children[0]!.id).toBe("leaf");
  expect(inserted.frame).toEqual(shape.frame);
  expect(model.elements.getElement("group")).toEqual(inserted);
  expect(model.elements.getElementNode("group")!.childIds).toEqual(["inner", "sibling"]);
  expect(model.elements.getRootIds()).toEqual(["group"]);
  const copy = new DocumentModelImpl(new YjsDoc("tree-copy"));
  copy.loadSnapshot(model.getSnapshot());
  expect(copy.elements.getElement("group")).toEqual(inserted);
  const fresh = new DocumentModelImpl(new YjsDoc("tree-insert-copy"));
  expect(fresh.elements.insertElement(inserted).children[0]!.children[0]!.id).toBe("leaf");
  model.history.undo();
  expect(model.elements.getElementNodes()).toEqual([]);
  model.history.redo();
  expect(model.elements.getElement("group")).toEqual(inserted);
  await model.destroy();
  await copy.destroy();
  await fresh.destroy();
});

it("rejects invalid descendants, duplicate identities, and cyclic inputs before writing", async () => {
  const model = new DocumentModelImpl(new YjsDoc("tree-validation"));
  const snapshot = model.getSnapshot();
  expect(() =>
    model.elements.insertElement({
      ...tree,
      children: [shape, { ...shape, frame: { ...shape.frame, width: 0 } }],
    }),
  ).toThrow();
  expect(() =>
    model.elements.insertElement({
      ...tree,
      children: [
        { ...shape, id: "same" },
        { ...shape, id: "same" },
      ],
    }),
  ).toThrow("already exists");
  expect(() =>
    model.elements.insertElement({ ...shape, childIds: "leaf" } as unknown as ElementInput),
  ).toThrow("must be an array");
  const cyclic: ElementInput = { ...tree, children: [] };
  cyclic.children!.push(cyclic);
  expect(() => model.elements.insertElement(cyclic)).toThrow("Cyclic");
  expect(() => model.elements.insertElement({ type: "container", zIndex: 0 })).toThrow(
    "without children",
  );
  expect(model.getSnapshot()).toEqual(snapshot);
  await model.destroy();
});

it("invalidates only the changed recursive branch and observes both parents after a move", async () => {
  const model = new DocumentModelImpl(new YjsDoc("tree-cache"));
  model.elements.insertElement(tree);
  const before = model.elements.getElement("group")!;
  expect(model.elements.getElement("group")).toBe(before);
  expect(before.children[0]).toBe(model.elements.getElement("inner"));
  const outerChanged = jest.fn();
  const innerChanged = jest.fn();
  const siblingChanged = jest.fn();
  model.elements.subscribeElement("group", outerChanged);
  model.elements.subscribeElement("inner", innerChanged);
  model.elements.subscribeElement("sibling", siblingChanged);
  model.elements.updateElement("leaf", { props: { text: "changed" } });
  const after = model.elements.getElement("group")!;
  expect(after).not.toBe(before);
  expect(after.children[0]!.children[0]!.props.text).toBe("changed");
  expect(after.children[1]).toBe(before.children[1]);
  expect(outerChanged).toHaveBeenCalledTimes(1);
  expect(innerChanged).toHaveBeenCalledTimes(1);
  expect(siblingChanged).not.toHaveBeenCalled();
  model.elements.moveElements(["leaf"], { parentId: "sibling" });
  expect(model.elements.getElement("inner")!.children).toEqual([]);
  expect(model.elements.getElement("sibling")!.children[0]!.id).toBe("leaf");
  expect(siblingChanged).toHaveBeenCalled();
  await model.destroy();
});

it("refreshes cached ancestors after remote edits and subtree removal", async () => {
  const a = new YjsDoc("tree-peers");
  const b = new YjsDoc("tree-peers");
  const left = new DocumentModelImpl(a);
  const right = new DocumentModelImpl(b);
  left.elements.insertElement(tree);
  b.applySnapshot(a.getSnapshot());
  const previous = right.elements.getElement("group")!;
  left.elements.updateElement("leaf", { frame: { x: 99 } });
  b.applySnapshot(a.getSnapshot());
  expect(right.elements.getElement("group")!.children[0]!.children[0]!.frame.x).toBe(99);
  expect(right.elements.getElement("group")!.children[1]).toBe(previous.children[1]);
  left.elements.removeElement("inner");
  b.applySnapshot(a.getSnapshot());
  expect(right.elements.getElement("group")!.children.map(({ id }) => id)).toEqual(["sibling"]);
  await left.destroy();
  await right.destroy();
});

it.each([10, 2000])(
  "materializes only changed recursive nodes among %i children",
  async (count) => {
    const doc = new YjsDoc(`tree-size-${count}`);
    const model = new DocumentModelImpl(doc);
    model.elements.insertElement({
      type: "container",
      id: "root",
      zIndex: 0,
      children: Array.from({ length: count }, (value, i) => ({ ...shape, id: `child-${i}` })),
    });
    const before = model.elements.getElement("root")!;
    const reads = jest.spyOn(model.elements, "getElementNode");
    model.elements.updateElement("child-0", { props: { text: "updated" } });
    const after = model.elements.getElement("root")!;
    expect(after.children[0]!.props.text).toBe("updated");
    expect(after.children[1]).toBe(before.children[1]);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(model.elements.getElement("root")).toBe(after);
    expect(reads).toHaveBeenCalledTimes(2);
    reads.mockRestore();
    await model.destroy();
  },
);

it("caches root arrays per subtree and updates their order without changing subtree values", async () => {
  const model = new DocumentModelImpl(new YjsDoc("tree-forest-cache"));
  model.elements.insertElement(tree);
  const other = model.elements.insertElement({ ...shape, type: "container" });
  model.elements.insertElement(shape, { parentId: other.id });
  const all = model.elements.getElements();
  const roots = model.elements.getElements();
  const unrelated = model.elements.getElements(other.id);
  expect(model.elements.getElements()).toBe(all);
  expect(model.elements.getElements()).toBe(roots);
  model.elements.updateElement("leaf", { frame: { x: 99 } });
  expect(model.elements.getElements()).not.toBe(all);
  expect(model.elements.getElements(other.id)).toBe(unrelated);
  expect(model.elements.getElements()[0]!.children[0]!.children[0]!.frame.x).toBe(99);
  const second = model.elements.insertElement(shape);
  const previous = model.elements.getElements();
  model.elements.moveElements([second.id], { parentId: null, beforeId: "group" });
  const next = model.elements.getElements();
  expect(next.map(({ id }) => id)).toEqual([second.id, "group", other.id]);
  expect(next[1]).toBe(previous[0]);
  await model.destroy();
});

it.each([10, 2000])(
  "invalidates cached ancestors in preloaded storage with %i siblings",
  async (count) => {
    const sourceDoc = new YjsDoc("preloaded-tree");
    const source = new DocumentModelImpl(sourceDoc);
    source.elements.insertElement({
      ...tree,
      children: [
        tree.children![0]!,
        ...Array.from({ length: count }, (value, i) => ({ ...shape, id: `sibling-${i}` })),
      ],
    });
    const doc = new YjsDoc("preloaded-tree");
    doc.applySnapshot(sourceDoc.getSnapshot());
    const model = new DocumentModelImpl(doc);
    const before = model.elements.getElement("group")!;
    const changed: string[] = [];
    for (const id of ["group", "inner", "sibling-0"]) {
      model.elements.subscribeElement(id, () => {
        changed.push(id);
      });
    }
    const reads = jest.spyOn(model.elements, "getElementNode");
    model.elements.updateElement("leaf", { frame: { x: 99 } });
    const after = model.elements.getElement("group")!;
    expect(after.children[0]!.children[0]!.frame.x).toBe(99);
    expect(after.children[1]).toBe(before.children[1]);
    expect(changed.sort()).toEqual(["group", "inner"]);
    expect(reads).toHaveBeenCalledTimes(3);
    reads.mockRestore();
    await model.destroy();
    await source.destroy();
  },
);
