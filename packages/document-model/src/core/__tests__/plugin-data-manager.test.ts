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
    const exposesUndoFactory: "createUndoManager" extends keyof typeof document ? true : false = false;
    expect(exposesCrdt).toBe(false);
    expect(exposesOrigin).toBe(false);
    expect(exposesUndoScopes).toBe(false);
    expect(exposesUndoFactory).toBe(false);
    expect(document.history).toBeDefined();
  });

  test("updates one namespace without replacing neighbors and snapshots shared maps", () => {
    const document = new DocumentModelImpl(new YjsDoc("plugin-data"));
    document.pluginData.set("neighbor", { retained: true });
    const visual = document.pluginData.getMap("visual");
    visual.set("one", { x: 1 });

    expect(document.pluginData.get("neighbor")).toEqual({ retained: true });
    expect(document.getSnapshot().pluginData).toEqual({
      neighbor: { retained: true },
      visual: { one: { x: 1 } },
    });

    document.loadSnapshot({ version: 6, pluginData: {
      neighbor: { retained: false },
      visual: { two: { x: 2 } },
    } });
    expect(visual.toObject()).toEqual({ two: { x: 2 } });
    expect(document.pluginData.get("neighbor")).toEqual({ retained: false });
  });

  test("participates in document undo history", () => {
    const crdt = new YjsDoc("plugin-data-undo");
    const document = new DocumentModelImpl(crdt);
    const history = document.history;
    document.batchUpdates(() => document.pluginData.set("test", { value: 1 }));
    history.stopCapturing();
    expect(document.pluginData.get("test")).toEqual({ value: 1 });
    history.undo();
    expect(document.pluginData.get("test")).toBeUndefined();
    history.destroy();
  });

  test("converges independent records inside a shared plugin namespace", () => {
    const docA = new YjsDoc("plugin-convergence-a");
    const docB = new YjsDoc("plugin-convergence-b");
    const modelA = new DocumentModelImpl(docA);
    const modelB = new DocumentModelImpl(docB);
    const recordsA = modelA.pluginData.getMap("visual");
    recordsA.set("a", { x: 1 });
    sync(docA, docB);
    const recordsB = modelB.pluginData.getMap("visual");
    recordsA.set("left", { x: 2 });
    recordsB.set("right", { x: 3 });
    sync(docA, docB);
    expect(recordsA.toObject()).toEqual(recordsB.toObject());
    expect(recordsA.toObject()).toMatchObject({ left: { x: 2 }, right: { x: 3 } });
  });
});
