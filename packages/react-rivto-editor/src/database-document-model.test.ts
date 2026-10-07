const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
import { YjsDocumentRegistry } from "@chulane/crdt-doc";
import { DocumentStorage, type BlockInput } from "@chulane/document-model";
import { DemoDatabase, DBDocumentModel } from "../../../demo/src/database";
import { EditorStorage } from "./editor-storage";
import { createReactEditor } from "./react-editor";
import { standardPreset } from "./extensions/built-ins/built-ins";
import { crossDocumentBlockTransfer } from "./extensions/built-ins/clipboard/cross-document-block-transfer";

const element = { type: "shape", frame: { x: 0, y: 0, width: 10, height: 10 }, zIndex: 0 };

async function fixture(database = new DemoDatabase()) {
  const registry = new YjsDocumentRegistry(crypto.randomUUID());
  const models = new DocumentStorage({ registry, createDocumentModel: (crdt) => new DBDocumentModel(crdt, database), lookupDocumentIds: async (id) => database.findDocumentIdsWithBlock(id) });
  const editors = new EditorStorage({ openDocument: (id) => models.openDocument(id), createEditor: (editor) => createReactEditor({ editor, extensions: [standardPreset()] }), lookupDocumentIds: (id, options) => models.findDocumentIdsWithBlock(id, options), subscribeDocumentIds: (listener) => database.subscribe(listener) });
  models.registerDocument("A"); models.registerDocument("B");
  const a = await editors.getSingleEditor("A"); const b = await editors.getSingleEditor("B");
  return { database, editors, models, a, b, destroy: async () => { await editors.destroy(); await models.destroy(); } };
}

test("allocates IDs through the database and rejects local duplicates and other record kinds before writing", async () => {
  const f = await fixture();
  const allocate = jestApi.spyOn(f.database, "createId");
  const block = f.a.blocks.insertBlock({ type: "paragraph" });
  const shape = f.a.getDocument().elements.insertElement(element);
  expect(allocate).toHaveBeenCalledTimes(2);
  expect(f.database.hasId("A", block.id)).toBe(true); expect(f.database.hasId("A", shape.id)).toBe(true);
  expect(() => f.a.blocks.insertBlock({ id: block.id, type: "paragraph" })).toThrow();
  expect(() => f.a.blocks.insertBlock({ id: shape.id, type: "paragraph" })).toThrow();
  expect(() => f.a.getDocument().elements.insertElement({ ...element, id: block.id })).toThrow();
  expect(() => f.a.blocks.insertBlock({ id: "fresh-parent", type: "paragraph", children: [{ id: shape.id, type: "paragraph" }] })).toThrow();
  expect(f.database.hasId("A", "fresh-parent")).toBe(false);
  expect(() => f.a.getDocument().elements.insertElement(shape)).toThrow();
  // The same identities, including IDs used as document names, are free in B.
  for (const id of [shape.id, "A"]) f.b.blocks.insertBlock({ id, type: "paragraph" });
  f.b.getDocument().elements.insertElement({ ...element, id: block.id });
  await f.editors.closeEditor("A");
  expect(await f.editors.resolveBlock({ documentId: "A", blockId: block.id })).toEqual({ documentId: "A", ambiguous: false });
  await f.destroy();
});

test("ordinary insertion reuses allocated subtree IDs and overwrites rows when removed blocks are reinserted", async () => {
  const f = await fixture();
  const source = f.a.blocks.insertBlock({ id: "shared", type: "paragraph", content: "Original", children: [{ id: "shared-child", type: "paragraph", content: "Child" }] });
  await f.editors.closeEditor("A");
  const allocate = jestApi.spyOn(f.database, "createId");
  const inserted = f.b.blocks.insertBlock(source);
  expect(inserted).toEqual(source);
  expect(allocate).not.toHaveBeenCalled();
  expect(f.database.blocks.get(source.id)?.get("B")?.content).toBe("Original");
  expect(f.database.findDocumentIdsWithBlock(source.id)).toEqual(["A", "B"]);
  f.b.history.clear();
  f.b.history.batchUpdates(() => {
    f.b.blocks.removeBlock(source.id);
    f.b.blocks.insertBlock({ ...source, content: "Replaced", children: [{ ...source.children[0]!, content: "Replaced child" }] });
  });
  expect(allocate).not.toHaveBeenCalled();
  expect(f.b.blocks.getRootIds()).toEqual([source.id]);
  expect(f.database.blocks.get(source.id)?.get("B")?.content).toBe("Replaced");
  expect(f.database.blocks.get("shared-child")?.get("B")?.content).toBe("Replaced child");
  f.b.history.undo();
  expect(f.b.blocks.getBlock(source.id)).toEqual(source);
  expect(f.database.blocks.get(source.id)?.get("B")?.content).toBe("Original");
  f.b.history.redo();
  expect(f.database.blocks.get(source.id)?.get("B")?.content).toBe("Replaced");
  expect((await f.editors.getSingleEditor("A")).blocks.getBlock(source.id)).toEqual(source);
  await f.destroy();
});

test("ordinary element insertion reuses allocated IDs and persists replacement geometry through undo and reopen", async () => {
  const f = await fixture();
  const source = f.a.elements.insertElement({ ...element, props: { label: "Original" } });
  await f.editors.closeEditor("A");
  const allocate = jestApi.spyOn(f.database, "createId");
  expect(f.b.elements.insertElement(source)).toEqual(source);
  expect(allocate).not.toHaveBeenCalled();
  f.b.history.clear();
  f.b.history.batchUpdates(() => {
    f.b.elements.removeElement(source.id);
    f.b.elements.insertElement({ ...source, frame: { ...source.frame, x: 30 }, props: { label: "Replacement" } });
  });
  expect(allocate).not.toHaveBeenCalled();
  expect(f.database.elements.get(source.id)?.get("B")).toMatchObject({ frame: { x: 30 }, props: { label: "Replacement" } });
  f.b.history.undo();
  expect(f.b.elements.getElement(source.id)).toEqual(source);
  expect(f.database.elements.get(source.id)?.get("B")).toEqual(source);
  f.b.history.redo();
  await f.editors.closeEditor("B");
  expect((await f.editors.getSingleEditor("B")).elements.getElement(source.id)).toMatchObject({ frame: { x: 30 }, props: { label: "Replacement" } });
  expect((await f.editors.getSingleEditor("A")).elements.getElement(source.id)).toEqual(source);
  await f.destroy();
});

test("reopening replays native collaborative data and keeps blocks, elements, and plugin data", async () => {
  const f = await fixture();
  const block = f.a.blocks.insertBlock({ type: "paragraph", content: "Saved", children: [{ type: "paragraph", content: "Child" }] });
  const shape = f.a.getDocument().elements.insertElement(element);
  f.a.getDocument().pluginData.set("demo", { persisted: true });
  await Promise.resolve(); // Complete native block-element projection before comparing persisted data.
  const snapshot = f.a.dump();
  await f.editors.closeEditor("A");
  const reopened = await f.editors.getSingleEditor("A");
  expect(reopened.getDocument()).toBeInstanceOf(DBDocumentModel);
  expect(reopened.dump()).toEqual(snapshot);
  expect(f.database.blocks.get(block.id)?.get("A")?.content).toBe("Saved");
  expect(f.database.elements.get(shape.id)?.get("A")?.type).toBe("shape");
  reopened.blocks.updateBlock(block.id, { content: "Updated after reopen" });
  await f.editors.closeEditor("A");
  expect((await f.editors.getSingleEditor("A")).blocks.getBlockNode(block.id)?.content).toBe("Updated after reopen");
  await f.destroy();
});

test("clipboard remaps destination collisions, while transfer and independent undo reuse existing IDs", async () => {
  const f = await fixture();
  const block = f.a.blocks.insertBlock({ id: "source", type: "paragraph", children: [{ id: "child", type: "paragraph" }] });
  const imported = f.b.blocks.importForest([block]);
  expect(imported.roots[0]!.id).toBe("source");
  expect(imported.roots[0]!.children[0]!.id).toBe("child");
  const again = f.b.blocks.importForest([block]);
  expect(again.roots[0]!.id).not.toBe("source");
  f.b.blocks.removeBlock("source");
  expect(f.b.getDocument().blocks.createImportIdMap([block.id]).get(block.id)).toBe(block.id);
  const copiedElement = f.a.getDocument().elements.insertElement({ ...element, id: "element" });
  f.b.getDocument().elements.insertElement(copiedElement);
  f.b.getDocument().elements.removeElement(copiedElement.id);
  expect(f.b.getDocument().elements.createImportIdMap([copiedElement.id]).get(copiedElement.id)).toBe(copiedElement.id);
  f.a.history.clear(); f.b.history.clear();
  crossDocumentBlockTransfer(f.editors.getEditor("A")!, f.editors.getEditor("B")!, ["source"], { targetId: null, position: "after" });
  expect(f.a.blocks.hasBlock("source")).toBe(false); expect(f.b.blocks.getBlock("source")?.children[0]?.id).toBe("child");
  expect(f.database.findDocumentIdsWithBlock("source")).toEqual(["B"]);
  f.a.history.undo();
  expect(f.a.blocks.hasBlock("source")).toBe(true); expect(f.b.blocks.hasBlock("source")).toBe(true);
  expect(f.database.findDocumentIdsWithBlock("source")).toEqual(["A", "B"]);
  f.b.history.undo();
  expect(f.b.blocks.hasBlock("source")).toBe(false); expect(f.database.findDocumentIdsWithBlock("source")).toEqual(["A"]);
  await f.destroy();
});

test.each([10, 2000])("persists one edited row without forest reads or lookup notifications for %i blocks", async (count) => {
  const f = await fixture();
  f.a.blocks.insertBlock({ id: "parent", type: "paragraph", children: Array.from({ length: count }, (_, index): BlockInput => ({ id: `child-${index}`, type: "paragraph" })) });
  const targetId = `child-${count - 1}`;
  expect(f.a.blocks.getBlockNode(targetId)?.content).toBe("");
  const observed: string[] = [];
  const stopBlock = f.a.blocks.subscribeBlockNode(targetId, () => { observed.push(f.a.blocks.getBlockNode(targetId)!.content); });
  const reads = jestApi.spyOn(f.a.getDocument().blocks, "getBlocks");
  const writes = jestApi.spyOn(f.database, "saveBlock"); const notifications = jestApi.fn();
  const stop = f.database.subscribe(notifications);
  f.a.blocks.updateBlock(targetId, { content: "Edited" });
  expect(observed).toEqual(["Edited"]);
  expect(f.database.blocks.get(targetId)?.get("A")?.content).toBe("Edited");
  expect(writes).toHaveBeenCalledTimes(1); expect(reads).not.toHaveBeenCalled(); expect(notifications).not.toHaveBeenCalled();
  f.a.history.undo(); expect(f.database.blocks.get(targetId)?.get("A")?.content).toBe("");
  expect(observed).toEqual(["Edited", ""]);
  stopBlock(); stop(); await f.destroy();
});

test("database element observers preserve cached reads and notifications through update, undo, and deletion", async () => {
  const f = await fixture();
  const elements = f.a.getDocument().elements;
  const shape = elements.insertElement(element);
  expect(elements.getElement(shape.id)).toEqual(shape);
  const observed: Array<number | undefined> = [];
  const stop = elements.subscribeElement(shape.id, () => { observed.push(elements.getElement(shape.id)?.frame.x); });
  f.a.history.clear();
  f.a.history.batchUpdates(() => elements.updateElement(shape.id, { frame: { ...shape.frame, x: 40 } }));
  expect(observed).toEqual([40]);
  expect(f.database.elements.get(shape.id)?.get("A")?.frame.x).toBe(40);
  f.a.history.undo();
  expect(observed).toEqual([40, 0]);
  expect(f.database.elements.get(shape.id)?.get("A")?.frame.x).toBe(0);
  elements.removeElement(shape.id);
  expect(observed).toEqual([40, 0, undefined]);
  expect(f.database.elements.has(shape.id)).toBe(false);
  stop(); await f.destroy();
});
