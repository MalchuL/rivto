import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "../document-model";

const shape = { type: "shape", frame: { x: 10, y: 20, width: 30, height: 40 }, zIndex: 0 };

it("inserts nested parents, promotes children in place, and restores changes through undo", async () => {
  const model = new DocumentModelImpl(new YjsDoc("element-groups"));
  const a = model.elements.insertElement(shape); const b = model.elements.insertElement(shape);
  const c = model.elements.insertElement(shape);
  model.history.clear();
  const inner = model.elements.insertElement({ type: "container", zIndex: 0, childIds: [a.id, b.id] });
  expect(inner.frame).toEqual(shape.frame);
  model.history.stopCapturing();
  const outer = model.elements.insertElement({ ...shape, type: "container", childIds: [inner.id, c.id] });
  expect(model.elements.getRootIds()).toEqual([outer.id]);
  expect(model.elements.getElementNode(outer.id)!.childIds).toEqual([inner.id, c.id]);
  expect(model.elements.getParentId(a.id)).toBe(inner.id);
  model.history.stopCapturing();
  model.elements.removeElementAndPromoteChildren(inner.id);
  expect(model.elements.getElementNode(outer.id)!.childIds).toEqual([a.id, b.id, c.id]);
  expect(model.elements.getElementNode(a.id)!.frame).toEqual(a.frame);
  model.history.undo();
  expect(model.elements.getElementNode(outer.id)!.childIds).toEqual([inner.id, c.id]);
  expect(model.elements.getElementNode(inner.id)!.childIds).toEqual([a.id, b.id]);
  model.history.redo();
  expect(model.elements.getParentId(a.id)).toBe(outer.id);
  await model.destroy();
});

it("moves an entire subtree between parents and rejects cycles before mutation", async () => {
  const model = new DocumentModelImpl(new YjsDoc("element-moves"));
  const container = model.elements.insertElement({ ...shape, type: "group" });
  const a = model.elements.insertElement(shape); const b = model.elements.insertElement(shape);
  const group = model.elements.insertElement({ ...shape, type: "container", childIds: [a.id, b.id] });
  model.elements.moveElements([group.id], { parentId: container.id });
  expect(model.elements.getRootIds()).toEqual([container.id]);
  expect(model.elements.getRootIds(container.id)).toEqual([group.id]);
  expect(model.elements.getParentId(a.id)).toBe(group.id);
  const before = model.getSnapshot();
  expect(() => model.elements.moveElements([group.id], { parentId: a.id })).toThrow("own subtree");
  expect(() => model.elements.moveElements([a.id], { parentId: "missing" })).toThrow("not found");
  expect(model.getSnapshot()).toEqual(before);
  model.elements.removeElement(group.id);
  expect(model.elements.getElementNodes().map(({ id }) => id)).toEqual([container.id]);
  await model.destroy();
});

it("round-trips canonical roots and children without persisting a second canvas owner", async () => {
  const model = new DocumentModelImpl(new YjsDoc("element-snapshot"));
  const a = model.elements.insertElement(shape); const b = model.elements.insertElement(shape);
  const group = model.elements.insertElement({ ...shape, type: "container", childIds: [a.id, b.id] });
  const snapshot = model.getSnapshot();
  expect(snapshot.elements.every((element) => !("canvasId" in element))).toBe(true);
  const copy = new DocumentModelImpl(new YjsDoc("element-copy"));
  copy.loadSnapshot(snapshot);
  expect(copy.getSnapshot()).toEqual(snapshot);
  expect(copy.elements.getParentId(a.id)).toBe(group.id);
  const invalid = structuredClone(snapshot);
  invalid.rootElementIds.push(a.id);
  expect(() => copy.loadSnapshot(invalid)).toThrow("Duplicate");
  expect(copy.getSnapshot()).toEqual(snapshot);
  await model.destroy(); await copy.destroy();
});

it("converges after concurrent moves without giving an element two parents", async () => {
  const leftDoc = new YjsDoc("element-peers"); const rightDoc = new YjsDoc("element-peers");
  const left = new DocumentModelImpl(leftDoc); const right = new DocumentModelImpl(rightDoc);
  const child = left.elements.insertElement(shape);
  const a = left.elements.insertElement({ ...shape, type: "group" });
  const b = left.elements.insertElement({ ...shape, type: "group" });
  rightDoc.applySnapshot(leftDoc.getSnapshot());
  left.elements.moveElements([child.id], { parentId: a.id });
  right.elements.moveElements([child.id], { parentId: b.id });
  const l = leftDoc.getSnapshot(); const r = rightDoc.getSnapshot();
  leftDoc.applySnapshot(r); rightDoc.applySnapshot(l);
  // Exchange repairs as well as the original concurrent writes.
  rightDoc.applySnapshot(leftDoc.getSnapshot()); leftDoc.applySnapshot(rightDoc.getSnapshot());
  expect(left.getSnapshot()).toEqual(right.getSnapshot());
  const snapshot = left.getSnapshot();
  const references = [...snapshot.rootElementIds, ...snapshot.elements.flatMap((element) => element.childIds)];
  expect(references.filter((id) => id === child.id)).toHaveLength(1);
  expect(left.elements.hasElement(child.id)).toBe(true);
  await left.destroy(); await right.destroy();
});

it("repairs concurrent cycles and keeps children inserted during parent deletion", async () => {
  const leftDoc = new YjsDoc("element-conflicts"); const rightDoc = new YjsDoc("element-conflicts");
  const left = new DocumentModelImpl(leftDoc); const right = new DocumentModelImpl(rightDoc);
  const a = left.elements.insertElement({ ...shape, id: "a", type: "group" });
  const b = left.elements.insertElement({ ...shape, id: "b", type: "group" });
  rightDoc.applySnapshot(leftDoc.getSnapshot());
  left.elements.moveElements([a.id], { parentId: b.id });
  right.elements.moveElements([b.id], { parentId: a.id });
  const exchange = () => {
    const l = leftDoc.getSnapshot(); const r = rightDoc.getSnapshot();
    leftDoc.applySnapshot(r); rightDoc.applySnapshot(l);
    rightDoc.applySnapshot(leftDoc.getSnapshot()); leftDoc.applySnapshot(rightDoc.getSnapshot());
  };
  exchange();
  expect(left.getSnapshot()).toEqual(right.getSnapshot());
  expect(left.elements.getElementNodes()).toHaveLength(2);
  left.elements.validateHierarchy(left.getSnapshot().elements, left.getSnapshot().rootElementIds);
  const root = left.elements.getRootIds()[0]!;
  left.elements.removeElement(root);
  const child = right.elements.insertElement(shape);
  right.elements.moveElements([child.id], { parentId: root });
  exchange();
  expect(left.getSnapshot()).toEqual(right.getSnapshot());
  expect(left.elements.getRootIds()).toEqual([child.id]);
  await left.destroy(); await right.destroy();
});

it.each([10, 2000])("keeps geometry updates independent of hierarchy size (%i elements)", async (count) => {
  const doc = new YjsDoc(`element-geometry-${count}`);
  const model = new DocumentModelImpl(doc);
  doc.transact(() => {
    for (let i = 0; i < count; i++) model.elements.insertElement({ ...shape, id: `e${i}` });
  });
  const roots = model.elements.getRootIds();
  const untouched = model.elements.getElementNode("e1");
  const reads = jest.spyOn(doc.getMap("rivto.editor.elements"), "keys");
  const listener = jest.fn();
  const unsubscribe = model.elements.subscribe(listener);
  model.elements.updateElement("e0", { frame: { x: 99 } });
  expect(model.elements.getElementNode("e0")!.frame.x).toBe(99);
  expect(model.elements.getRootIds()).toBe(roots);
  expect(model.elements.getElementNode("e1")).toBe(untouched);
  expect(reads).not.toHaveBeenCalled();
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe(); reads.mockRestore(); await model.destroy();
});
