import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "../document-model";

const shape = { childIds: [], type: "shape", frame: { x: 0, y: 0, width: 20, height: 30 }, zIndex: 0 };

it("round-trips independent element subtrees and rejects broken references before replacing blocks", async () => {
  const model = new DocumentModelImpl(new YjsDoc("container-roundtrip"));
  model.blocks.insertBlock({ id: "section", type: "paragraph" });
  const container = model.elements.insertElement({ ...shape, type: "group" });
  model.elements.insertElement(shape, { parentId: container.id });
  const snapshot = model.getSnapshot();
  expect(() => model.loadSnapshot({ ...snapshot, blocks: [], rootElementIds: [] })).toThrow("Every element must belong");
  expect(model.getSnapshot()).toEqual(snapshot);
  expect(() => model.elements.insertElement(shape, { parentId: "missing" })).toThrow();
  const copy = new DocumentModelImpl(new YjsDoc("container-copy"));
  copy.loadSnapshot(snapshot);
  expect(copy.getSnapshot()).toEqual(snapshot);
  await model.destroy(); await copy.destroy();
});

it("isolates subscriptions and snapshots and restores a deleted container with its elements through undo", async () => {
  const model = new DocumentModelImpl(new YjsDoc("container-subscriptions"));
  const container = model.elements.insertElement({ ...shape, type: "group" });
  const main = model.elements.insertElement(shape);
  const local = model.elements.insertElement(shape, { parentId: container.id });
  const before = model.elements.getElementNodes(container.id);
  let notifications = 0;
  const unsubscribe = model.elements.subscribeElement(container.id, () => notifications++);
  model.elements.updateElement(main.id, { frame: { x: 10 } });
  expect(model.elements.getElementNodes(container.id)).toBe(before);
  expect(notifications).toBe(0);
  model.history.clear();
  model.elements.removeElement(container.id);
  expect(model.elements.hasElement(local.id)).toBe(false);
  expect(model.elements.hasElement(main.id)).toBe(true);
  expect(notifications).toBe(1);
  model.history.undo();
  expect(model.elements.getRootIds(container.id)).toEqual([local.id]);
  expect(model.elements.getElement(local.id)).toEqual(local);
  unsubscribe(); await model.destroy();
});

it("merges independent container edits between peers without mixing element membership", async () => {
  const a = new YjsDoc("shared-container"); const b = new YjsDoc("shared-container");
  const left = new DocumentModelImpl(a); const right = new DocumentModelImpl(b);
  const first = left.elements.insertElement({ ...shape, type: "group" });
  b.applySnapshot(a.getSnapshot());
  const second = right.elements.insertElement({ ...shape, type: "group" });
  const one = left.elements.insertElement(shape, { parentId: first.id });
  const two = right.elements.insertElement(shape, { parentId: second.id });
  const leftState = a.getSnapshot(); const rightState = b.getSnapshot();
  a.applySnapshot(rightState); b.applySnapshot(leftState);
  for (const model of [left, right]) {
    expect(model.elements.getElementNodes(first.id)).toEqual([model.elements.getElementNode(one.id)]);
    expect(model.elements.getElementNodes(second.id)).toEqual([model.elements.getElementNode(two.id)]);
  }
  await left.destroy(); await right.destroy();
});

it("notifies document and subtree readers when a snapshot replaces an element's membership", async () => {
  const model = new DocumentModelImpl(new YjsDoc("container-replacement"));
  const container = model.elements.insertElement({ ...shape, type: "group" });
  const element = model.elements.insertElement(shape);
  const mainChanged = jest.fn(); const containerChanged = jest.fn();
  model.elements.subscribe(mainChanged);
  model.elements.subscribeElement(container.id, containerChanged);
  const snapshot = model.getSnapshot();
  snapshot.rootElementIds = [container.id];
  snapshot.elements.find(({ id }) => id === container.id)!.childIds = [element.id];
  model.loadSnapshot(snapshot);
  expect(model.elements.getRootIds()).toEqual([container.id]);
  expect(model.elements.getElement(element.id)).toEqual(element);
  expect(model.elements.getElementNodes(container.id).map(({ id }) => id)).toEqual([element.id]);
  expect(mainChanged).toHaveBeenCalled();
  expect(containerChanged).toHaveBeenCalled();
  await model.destroy();
});

it("publishes current recursive and flat values when a remote commit changes roots and payloads", async () => {
  const a = new YjsDoc("remote-root-payload"); const b = new YjsDoc("remote-root-payload");
  const left = new DocumentModelImpl(a); const right = new DocumentModelImpl(b);
  left.elements.insertElement({ ...shape, id: "first" });
  left.elements.insertElement({ ...shape, id: "second" });
  b.applySnapshot(a.getSnapshot());
  right.elements.getElements(); right.elements.getElementNodes();
  const observed: ReturnType<typeof right.elements.getElements>[] = [];
  right.elements.subscribe(() => observed.push(right.elements.getElements()));
  a.transact(() => {
    left.elements.moveElements(["second"], { parentId: null, beforeId: "first" });
    left.elements.updateElement("first", { frame: { x: 123 } });
  });
  b.applySnapshot(a.getSnapshot());
  expect(observed).toHaveLength(1);
  expect(observed[0]!.map(({ id }) => id)).toEqual(["second", "first"]);
  expect(observed[0]![1]!.frame.x).toBe(123);
  await left.destroy(); await right.destroy();
});
