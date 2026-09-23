import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "../document-model";
import * as Y from "yjs";

const sync = (left: YjsDoc, right: YjsDoc): void => {
  const leftUpdate = Y.encodeStateAsUpdate(left.doc);
  const rightUpdate = Y.encodeStateAsUpdate(right.doc);
  Y.applyUpdate(left.doc, rightUpdate);
  Y.applyUpdate(right.doc, leftUpdate);
};

describe("DocumentPluginDataManager", () => {
  test("keeps CRDT runtime state outside the public model", () => {
    const document = new DocumentModelImpl(new YjsDoc("private-runtime"));

    const exposesCrdt: "crdt" extends keyof typeof document ? true : false = false;
    const exposesOrigin: "origin" extends keyof typeof document ? true : false = false;
    const exposesUndoScopes: "undoScopes" extends keyof typeof document ? true : false = false;
    const blocksExposeUndoScopes: "undoScopes" extends keyof typeof document.blocks ? true : false = false;
    const elementsExposeUndoScopes: "undoScopes" extends keyof typeof document.elements ? true : false = false;
    const pluginsExposeUndoScopes: "undoScopes" extends keyof typeof document.pluginData ? true : false = false;
    const blocksExposePipe: "pipe" extends keyof typeof document.blocks ? true : false = false;
    const elementsExposePipe: "pipe" extends keyof typeof document.elements ? true : false = false;
    const exposesUndoFactory: "createUndoManager" extends keyof typeof document ? true : false = false;
    const exposesTransaction: "transact" extends keyof typeof document ? true : false = false;
    const exposesPluginMap: "getMap" extends keyof typeof document.pluginData ? true : false = false;
    type RemovedBatching = Extract<
      "batchUpdates" | "batchUpdatesWithoutHistory",
      keyof typeof document
    >;
    const exposesBatching: Record<RemovedBatching, never> = {};
    expect(exposesCrdt).toBe(false);
    expect(exposesOrigin).toBe(false);
    expect(exposesUndoScopes).toBe(false);
    expect(blocksExposeUndoScopes).toBe(false);
    expect(elementsExposeUndoScopes).toBe(false);
    expect(pluginsExposeUndoScopes).toBe(false);
    expect(blocksExposePipe).toBe(false);
    expect(elementsExposePipe).toBe(false);
    expect(exposesUndoFactory).toBe(false);
    expect(exposesTransaction).toBe(false);
    expect(exposesPluginMap).toBe(false);
    expect(exposesBatching).toEqual({});
    expect(document).not.toHaveProperty("batchUpdates");
    expect(document).not.toHaveProperty("batchUpdatesWithoutHistory");
    expect(document.blocks).not.toHaveProperty("pipe");
    expect(document.elements).not.toHaveProperty("pipe");
    expect(document.history.batchUpdates).toBeInstanceOf(Function);
    expect(document.history.batchUpdatesWithoutHistory).toBeInstanceOf(Function);
    expect(document.history).toBeDefined();
  });

  test("updates one namespace without replacing neighbors and snapshots shared maps", () => {
    const document = new DocumentModelImpl(new YjsDoc("plugin-data"));
    document.pluginData.set("neighbor", { retained: true });
    document.pluginData.setField("visual", "one", { x: 1 });

    expect(document.pluginData.get("neighbor")).toEqual({ retained: true });
    expect(document.getSnapshot().pluginData).toEqual({
      neighbor: { retained: true },
      visual: { one: { x: 1 } },
    });

    document.loadSnapshot({ version: 6, pluginData: {
      neighbor: { retained: false },
      visual: { two: { x: 2 } },
    } });
    expect(document.pluginData.get("visual")).toEqual({ two: { x: 2 } });
    expect(document.pluginData.get("neighbor")).toEqual({ retained: false });
  });

  test("participates in document undo history", async () => {
    const crdt = new YjsDoc("plugin-data-undo");
    const document = new DocumentModelImpl(crdt);
    const history = document.history;
    history.batchUpdates(() => document.pluginData.set("test", { value: 1 }));
    history.stopCapturing();
    expect(document.pluginData.get("test")).toEqual({ value: 1 });
    history.undo();
    expect(document.pluginData.get("test")).toBeUndefined();
    await document.destroy();
  });

  test("converges independent records inside a shared plugin namespace", () => {
    const docA = new YjsDoc("plugin-convergence-a");
    const docB = new YjsDoc("plugin-convergence-b");
    const modelA = new DocumentModelImpl(docA);
    const modelB = new DocumentModelImpl(docB);
    modelA.pluginData.setField("visual", "a", { x: 1 });
    sync(docA, docB);
    modelA.pluginData.setField("visual", "left", { x: 2 });
    modelB.pluginData.setField("visual", "right", { x: 3 });
    sync(docA, docB);
    expect(modelA.pluginData.get("visual")).toEqual(modelB.pluginData.get("visual"));
    expect(modelA.pluginData.get("visual")).toMatchObject({ left: { x: 2 }, right: { x: 3 } });
  });

  test("reads and deletes detached namespace fields", () => {
    const document = new DocumentModelImpl(new YjsDoc("plugin-fields"));
    document.pluginData.set("visual", { one: { x: 1 }, two: true });

    const one = document.pluginData.getField<{ x: number }>("visual", "one")!;
    one.x = 2;
    expect(document.pluginData.getField("visual", "one")).toEqual({ x: 1 });
    expect(document.pluginData.deleteField("visual", "two")).toBe(true);
    expect(document.pluginData.deleteField("visual", "missing")).toBe(false);
    expect(document.pluginData.get("visual")).toEqual({ one: { x: 1 } });
  });
});
