import { YjsDoc } from "../yjs-doc";
import * as Y from "yjs";
import { Provider } from "../../types";
import { YjsArray, YjsMap, YjsText } from "../structures";

describe("YjsDoc", () => {
  let yjsDoc: YjsDoc;
  const docId = "test-doc-id";

  beforeEach(() => {
    // Instantiate YjsDoc
    yjsDoc = new YjsDoc(docId);
  });

  afterEach(async () => {
    await yjsDoc.destroy();
  });

  it("should initialize with correct ID", () => {
    expect(yjsDoc.id).toBe(docId);
  });

  it("should use provided Y.Doc if passed in constructor", () => {
    const customDoc = new Y.Doc();
    const doc = new YjsDoc(docId, customDoc);
    // @ts-ignore - accessing private property for test
    expect(doc["doc"]).toBe(customDoc);
    doc.destroy();
  });

  describe("Provider management", () => {
    const mockProvider: Provider = {
      id: "provider-1",
      connect: jest.fn(),
      disconnect: jest.fn(),
    };

    it("waits for a pending connection before destroying its provider", async () => {
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      let connected = false;
      const provider: Provider = {
        id: "pending-destroy",
        connect: async () => {
          await pending;
          connected = true;
        },
        disconnect: jest.fn(async () => {
          connected = false;
        }),
      };
      const attaching = yjsDoc.attachProvider(provider);
      const destroying = yjsDoc.destroy();
      await Promise.resolve();
      finish();
      await attaching;
      await destroying;
      expect(provider.disconnect).toHaveBeenCalledTimes(1);
      expect(connected).toBe(false);
    });

    it("waits for a pending connection before detaching its provider", async () => {
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      let connected = false;
      const provider: Provider = {
        id: "pending-detach",
        connect: async () => {
          await pending;
          connected = true;
        },
        disconnect: jest.fn(async () => {
          connected = false;
        }),
      };
      const attaching = yjsDoc.attachProvider(provider);
      const detaching = yjsDoc.detachProvider(provider.id);
      await Promise.resolve();
      finish();
      await attaching;
      await detaching;
      expect(provider.disconnect).toHaveBeenCalledTimes(1);
      expect(connected).toBe(false);
    });

    it("shares concurrent disconnection and retries a failed disconnection", async () => {
      const failure = new Error("disconnect failed");
      const disconnect = jest.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
      const provider: Provider = { id: "retry", connect: jest.fn(), disconnect };
      const cleanup = await yjsDoc.attachProvider(provider);
      const first = cleanup();
      const second = yjsDoc.detachProvider(provider.id);
      await expect(first).rejects.toBe(failure);
      await expect(second).rejects.toBe(failure);
      expect(disconnect).toHaveBeenCalledTimes(1);
      await cleanup();
      expect(disconnect).toHaveBeenCalledTimes(2);
    });

    it("does not let an old cleanup disconnect a replacement provider", async () => {
      const first: Provider = { id: "replacement", connect: jest.fn(), disconnect: jest.fn() };
      const second: Provider = { id: first.id, connect: jest.fn(), disconnect: jest.fn() };
      const oldCleanup = await yjsDoc.attachProvider(first);
      await yjsDoc.detachProvider(first.id);
      const newCleanup = await yjsDoc.attachProvider(second);
      await oldCleanup();
      expect(second.disconnect).not.toHaveBeenCalled();
      await newCleanup();
      expect(second.disconnect).toHaveBeenCalledTimes(1);
    });

    it("shares an in-flight disconnection with document destruction", async () => {
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const provider: Provider = {
        id: "pending-disconnect",
        connect: jest.fn(),
        disconnect: jest.fn(() => pending),
      };
      const cleanup = await yjsDoc.attachProvider(provider);
      const native = yjsDoc.doc;
      const detaching = cleanup();
      const destroying = yjsDoc.destroy();
      await Promise.resolve();
      expect(provider.disconnect).toHaveBeenCalledTimes(1);
      expect(yjsDoc.doc).toBe(native);
      finish();
      await Promise.all([detaching, destroying]);
      expect(provider.disconnect).toHaveBeenCalledTimes(1);
      expect(() => yjsDoc.doc).toThrow("destroyed");
    });

    it("releases a failed pending connection during destruction", async () => {
      let fail!: (error: Error) => void;
      const pending = new Promise<void>((_, reject) => {
        fail = reject;
      });
      const failure = new Error("connect failed");
      const provider: Provider = {
        id: "failed-pending",
        connect: () => pending,
        disconnect: jest.fn(),
      };
      const attaching = yjsDoc.attachProvider(provider);
      const rejection = expect(attaching).rejects.toBe(failure);
      const destroying = yjsDoc.destroy();
      expect(yjsDoc.destroy()).toBe(destroying);
      fail(failure);
      await rejection;
      await destroying;
      expect(provider.disconnect).not.toHaveBeenCalled();
      await expect(yjsDoc.attachProvider(provider)).rejects.toThrow("destroyed");
    });

    it("attachProvider should store provider, connect, and return cleanup", async () => {
      const cleanup = await yjsDoc.attachProvider(mockProvider);

      expect(mockProvider.connect).toHaveBeenCalledWith(yjsDoc);
      await cleanup();
      expect(mockProvider.disconnect).toHaveBeenCalledWith(yjsDoc);

      // Cleanup belongs to one exact attachment and is safe to call again.
      await expect(cleanup()).resolves.toBeUndefined();
    });

    it("detachProvider should infer the provider when exactly one is attached", async () => {
      await yjsDoc.attachProvider(mockProvider);
      await yjsDoc.detachProvider();

      expect(mockProvider.disconnect).toHaveBeenCalledWith(yjsDoc);
      await expect(yjsDoc.detachProvider()).rejects.toThrow();
    });

    it("detachProvider should select one of multiple providers by ID", async () => {
      const otherProvider: Provider = {
        id: "provider-2",
        connect: jest.fn(),
        disconnect: jest.fn(),
      };
      await yjsDoc.attachProvider(mockProvider);
      await yjsDoc.attachProvider(otherProvider);

      await expect(yjsDoc.detachProvider()).rejects.toThrow("multiple items");
      await yjsDoc.detachProvider(mockProvider.id);

      expect(mockProvider.disconnect).toHaveBeenCalledWith(yjsDoc);
      expect(otherProvider.disconnect).not.toHaveBeenCalled();
      await yjsDoc.detachProvider(otherProvider.id);
    });

    it("attachProvider should reject duplicate IDs", async () => {
      const duplicateProvider: Provider = {
        id: mockProvider.id,
        connect: jest.fn(),
        disconnect: jest.fn(),
      };
      await yjsDoc.attachProvider(mockProvider);

      await expect(yjsDoc.attachProvider(duplicateProvider)).rejects.toThrow("already attached");
      expect(duplicateProvider.connect).not.toHaveBeenCalled();
    });

    it("attachProvider should release the ID when connecting fails", async () => {
      const error = new Error("connect failed");
      const failingProvider: Provider = {
        id: "failing-provider",
        connect: jest.fn().mockRejectedValue(error),
        disconnect: jest.fn(),
      };
      const replacementProvider: Provider = {
        id: failingProvider.id,
        connect: jest.fn(),
        disconnect: jest.fn(),
      };

      await expect(yjsDoc.attachProvider(failingProvider)).rejects.toBe(error);
      await expect(yjsDoc.attachProvider(replacementProvider)).resolves.toEqual(
        expect.any(Function),
      );
    });
  });

  describe("Data structure access", () => {
    it("getArray should return YjsArray", () => {
      const array = yjsDoc.getArray("test-array");
      expect(array).toBeInstanceOf(YjsArray);
      // Verify it's connected to the underlying doc
      // push takes ...items, so push('item') appends 'item'.
      array.push("item");

      // Verify with raw Y.Doc
      // @ts-ignore
      const rawArray = yjsDoc["doc"].getArray("test-array");
      expect(rawArray.get(0)).toBe("item");
    });

    it("getMap should return YjsMap", () => {
      const map = yjsDoc.getMap("test-map");
      expect(map).toBeInstanceOf(YjsMap);

      map.set("key", "value");

      // Verify with raw Y.Doc
      // @ts-ignore
      const rawMap = yjsDoc["doc"].getMap("test-map");
      expect(rawMap.get("key")).toBe("value");
    });

    it("getText should return YjsText", () => {
      const text = yjsDoc.getText("test-text");
      expect(text).toBeInstanceOf(YjsText);

      text.insert(0, "hello");

      // Verify with raw Y.Doc
      // @ts-ignore
      const rawText = yjsDoc["doc"].getText("test-text");
      expect(rawText.toString()).toBe("hello");
    });
  });

  describe("Transactions", () => {
    it("transact should execute transaction", () => {
      const callback = jest.fn();
      yjsDoc.transact(callback);
      expect(callback).toHaveBeenCalled();
    });

    it("transact should batch updates", () => {
      let eventCount = 0;
      yjsDoc.on("update", () => {
        eventCount++;
      });

      yjsDoc.transact(() => {
        yjsDoc.getMap("map").set("a", 1);
        yjsDoc.getMap("map").set("b", 2);
      });

      // YJS emits one update event per transaction
      expect(eventCount).toBe(1);
    });

    it("reports transaction state through nested work and update publication", () => {
      const observed: boolean[] = [];
      yjsDoc.on("update", () => observed.push(yjsDoc.isTransacting));

      expect(yjsDoc.isTransacting).toBe(false);
      yjsDoc.transact(() => {
        expect(yjsDoc.isTransacting).toBe(true);
        yjsDoc.transact(() => yjsDoc.getMap("map").set("nested", true));
        expect(yjsDoc.isTransacting).toBe(true);
      });

      expect(observed).toEqual([true]);
      expect(yjsDoc.isTransacting).toBe(false);
    });

    it("tracks default local transactions without exposing an origin token", () => {
      const map = yjsDoc.getMap("undo-map");
      const history = yjsDoc.createUndoManager([map]);

      yjsDoc.transact(() => map.set("value", 1));
      history.stopCapturing();
      history.undo();

      expect(map.has("value")).toBe(false);
      history.destroy();
    });

    it("keeps only the configured number of undo and redo steps", () => {
      const map = yjsDoc.getMap("limited-undo-map");
      const history = yjsDoc.createUndoManager([map], undefined, 2);
      for (const value of [1, 2, 3]) {
        yjsDoc.transact(() => map.set("value", value));
        history.stopCapturing();
      }

      history.undo();
      expect(map.get("value")).toBe(2);
      history.undo();
      expect(map.get("value")).toBe(1);
      history.undo();
      expect(map.get("value")).toBe(1);
      history.redo();
      history.redo();
      expect(map.get("value")).toBe(3);
      history.destroy();
    });

    it("does not keep deleted content when history is disabled", () => {
      const map = yjsDoc.getMap("disabled-history");
      const history = yjsDoc.createUndoManager([map], undefined, 0);
      const native = yjsDoc.doc.getMap("disabled-history");
      yjsDoc.transact(() => native.set("block", new Y.Map([["text", "deleted content"]])));
      yjsDoc.transact(() => native.delete("block"));

      expect(native._map.get("block")?.content).toBeInstanceOf(Y.ContentDeleted);
      history.undo();
      expect(native.has("block")).toBe(false);
      history.destroy();
    });

    it("cancels scheduled trimming when history is cleared or destroyed", () => {
      jest.useFakeTimers();
      try {
        const map = yjsDoc.getMap("cancel-history-trim");
        const history = yjsDoc.createUndoManager([map], undefined, 1);
        for (const value of [1, 2]) {
          yjsDoc.transact(() => map.set("value", value));
          history.stopCapturing();
        }
        expect(jest.getTimerCount()).toBe(1);
        history.clear();
        expect(jest.getTimerCount()).toBe(0);
        for (const value of [3, 4]) {
          yjsDoc.transact(() => map.set("value", value));
          history.stopCapturing();
        }
        expect(jest.getTimerCount()).toBe(1);
        history.destroy();
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it("keeps deleted content needed by a separate native history after eviction", async () => {
      const map = yjsDoc.getMap("limited-shared-undo");
      const shared = Symbol("shared");
      const local = Symbol("local");
      const history = yjsDoc.createUndoManager([map], [shared, local], 1);
      const native = new Y.UndoManager(yjsDoc.doc.getMap("limited-shared-undo"), {
        trackedOrigins: new Set([shared]),
      });
      yjsDoc.doc.transact(() => map.set("value", "retained"), shared);
      history.stopCapturing();
      native.stopCapturing();
      yjsDoc.doc.transact(() => map.delete("value"), shared);
      history.stopCapturing();
      yjsDoc.doc.transact(() => map.set("other", 1), local);
      await new Promise((resolve) => setTimeout(resolve, 0));
      Y.tryGc(
        Y.createDeleteSetFromStructStore(yjsDoc.doc.store),
        yjsDoc.doc.store,
        yjsDoc.doc.gcFilter,
      );

      history.undo();
      expect(map.get("other")).toBeUndefined();
      history.undo();
      expect(map.get("value")).toBeUndefined();
      native.undo();
      expect(map.get("value")).toBe("retained");
      history.destroy();
      native.destroy();
    });

    it("preserves another history's undo data when one history is cleared", () => {
      const map = yjsDoc.getMap("shared-undo-map");
      const first = yjsDoc.createUndoManager([map]);
      const second = yjsDoc.createUndoManager([map]);

      yjsDoc.transact(() => map.set("value", "retained"));
      first.stopCapturing();
      second.stopCapturing();
      yjsDoc.transact(() => map.delete("value"));
      first.clear();
      second.undo();

      expect(map.get("value")).toBe("retained");
      first.destroy();
      second.destroy();
    });

    it("preserves a native Yjs history when adapter history is cleared", () => {
      const map = yjsDoc.getMap("native-shared-undo-map");
      const origin = Symbol("shared-history");
      const adapterHistory = yjsDoc.createUndoManager([map], [origin]);
      const nativeHistory = new Y.UndoManager(yjsDoc.doc.getMap("native-shared-undo-map"), {
        trackedOrigins: new Set([origin]),
      });

      yjsDoc.doc.transact(() => map.set("value", "retained"), origin);
      adapterHistory.stopCapturing();
      nativeHistory.stopCapturing();
      yjsDoc.doc.transact(() => map.delete("value"), origin);
      adapterHistory.clear();
      nativeHistory.undo();

      expect(map.get("value")).toBe("retained");
      adapterHistory.destroy();
      nativeHistory.destroy();
    });

    it("removes a destroyed history manager's document listener", () => {
      const on = jest.spyOn(yjsDoc.doc, "on");
      const off = jest.spyOn(yjsDoc.doc, "off");
      const history = yjsDoc.createUndoManager([yjsDoc.getMap("history-listener")]);
      const destroyListener = on.mock.calls.find(([event]) => event === "destroy")?.[1];

      expect(destroyListener).toBeDefined();
      history.destroy();
      expect(off).toHaveBeenCalledWith("destroy", destroyListener);
    });

    it("does not accumulate teardown listeners for limited histories", () => {
      const map = yjsDoc.getMap("limited-history-listeners");
      const before = yjsDoc.doc._observers.get("destroy")?.size ?? 0;
      for (let index = 0; index < 25; index++) {
        const history = yjsDoc.createUndoManager([map], undefined, 1);
        history.destroy();
      }
      expect(yjsDoc.doc._observers.get("destroy")?.size ?? 0).toBe(before);
    });
  });

  describe("Events", () => {
    it("on should register handler and return unsubscribe function", () => {
      const handler = jest.fn();
      const event = "update";

      const unsubscribe = yjsDoc.on(event, handler);

      // Trigger an update
      yjsDoc.getMap("map").set("key", "value");

      expect(handler).toHaveBeenCalled();

      const callCount = handler.mock.calls.length;

      unsubscribe();

      // Trigger another update
      yjsDoc.getMap("map").set("key", "value2");

      expect(handler).toHaveBeenCalledTimes(callCount);
    });
  });

  describe("Lifecycle", () => {
    it("releases the native document after a provider disconnection fails", async () => {
      const failure = new Error("disconnect failed");
      const adapter = new YjsDoc("failing-destroy");
      const disconnect = jest.fn().mockRejectedValue(failure);
      const otherDisconnect = jest.fn();
      await adapter.attachProvider({ id: "failing", connect: jest.fn(), disconnect });
      await adapter.attachProvider({
        id: "other",
        connect: jest.fn(),
        disconnect: otherDisconnect,
      });
      const destruction = adapter.destroy();
      expect(adapter.destroy()).toBe(destruction);
      await expect(destruction).rejects.toBe(failure);
      expect(otherDisconnect).toHaveBeenCalledTimes(1);
      expect(() => adapter.doc).toThrow("destroyed");
    });

    it("destroy should disconnect every provider before cleaning up resources", async () => {
      const first: Provider = { id: "first", connect: jest.fn(), disconnect: jest.fn() };
      const second: Provider = { id: "second", connect: jest.fn(), disconnect: jest.fn() };
      await yjsDoc.attachProvider(first);
      await yjsDoc.attachProvider(second);

      await yjsDoc.destroy();

      expect(first.disconnect).toHaveBeenCalledWith(yjsDoc);
      expect(second.disconnect).toHaveBeenCalledWith(yjsDoc);
    });
  });
  describe("Snapshot", () => {
    beforeEach(() => {
      yjsDoc.getMap("map").set("key", "value");
    });
    it("getSnapshot should return snapshot", () => {
      const snapshot = yjsDoc.getSnapshot();
      expect(snapshot).toBeDefined();
    });
    it("applySnapshot should apply snapshot", () => {
      const snapshot = yjsDoc.getSnapshot();
      yjsDoc.applySnapshot(snapshot);
      expect(yjsDoc.getMap("map").get("key")).toBe("value");
    });
  });
  describe("Serialization", () => {
    it("toJSON should serialize shared types to plain object", () => {
      const root = yjsDoc.getMap("root") as YjsMap;
      root.set("title", "Hello");
      root.set("count", 2);

      const items = yjsDoc.createDetachedArray();
      items.push("first");
      root.set("items", items);

      const json = yjsDoc.toJSON();
      expect(json).toEqual({
        root: {
          title: "Hello",
          count: 2,
          items: ["first"],
        },
      });
    });

    it("rejects unsupported roots before clearing existing state", () => {
      yjsDoc.getMap("root").set("title", "Preserved");

      expect(() => yjsDoc.fromJSON({ root: { title: "Changed" }, invalid: 1 })).toThrow(
        'Unsupported root type for key "invalid"',
      );
      expect(yjsDoc.getMap("root").get("title")).toBe("Preserved");
    });

    it("fromJSON should restore document state", () => {
      const mapRoot = new Map<string, any>([
        ["title", "FromMapRoot"],
        ["numbers", [1, 2]],
        ["innerMap", new Map<string, any>([["enabled", true]])],
      ]);

      const payload = {
        root: {
          title: "Restored",
          items: ["a", "b"],
          nested: { done: true, count: 5 },
        },
        mapRoot,
        arrayRoot: [{ deep: ["x", { nested: "obj" }] }, "tail"],
      };

      yjsDoc.fromJSON(payload, { string2crdttext: false });

      const root = yjsDoc.getMap("root") as YjsMap;
      const title = root.get("title");
      expect(title).toBe("Restored");

      const items = root.get("items") as YjsArray;
      expect(items.length).toBe(2);
      expect(items.get(0)).toBe("a");

      const nested = root.get("nested") as YjsMap;
      expect(nested.get("done")).toBe(true);
      expect(nested.get("count")).toBe(5);

      const restoredMapRoot = yjsDoc.getMap("mapRoot") as YjsMap;
      expect(restoredMapRoot.get("title")).toBe("FromMapRoot");
      const restoredNumbers = restoredMapRoot.get("numbers") as YjsArray;
      expect(restoredNumbers.toArray()).toEqual([1, 2]);
      const inner = restoredMapRoot.get("innerMap") as YjsMap;
      expect(inner.get("enabled")).toBe(true);

      const restoredArrayRoot = yjsDoc.getArray("arrayRoot") as YjsArray;
      expect(restoredArrayRoot.length).toBe(2);
      const firstEntry = restoredArrayRoot.get(0) as YjsMap;
      expect((firstEntry.get("deep") as YjsArray).get(0)).toEqual("x");
      expect(((firstEntry.get("deep") as YjsArray).get(1) as YjsMap).toObject()).toEqual({
        nested: "obj",
      });
      expect(restoredArrayRoot.get(1)).toBe("tail");
    });
  });

  describe("Nested detached structures", () => {
    let rootMap: YjsMap;

    beforeEach(() => {
      rootMap = yjsDoc.getMap("root") as YjsMap;
    });

    it("should support Map inside Map", () => {
      const nestedMap = yjsDoc.createDetachedMap();
      rootMap.set("nested", nestedMap);

      // Verify via retrieval
      const retrieved = rootMap.get("nested") as YjsMap;
      expect(retrieved).toBeInstanceOf(YjsMap);

      const crdtmap = yjsDoc.createDetachedMap();
      const crdtarray = yjsDoc.createDetachedArray();
      const crdttext = yjsDoc.createDetachedText();
      const text = "hello";
      const number = 1;
      const boolean = true;
      const nullValue = null;
      const array = [1, 2, { nested: { inner: 1 } }];
      const object = { key: "value", nested: { inner: 1 } };
      const undefinedValue = undefined;
      const functionValue = () => {};

      retrieved.set("crdtmap", crdtmap);
      retrieved.set("crdtarray", crdtarray);
      retrieved.set("crdttext", crdttext);
      retrieved.set("text", text);
      retrieved.set("number", number);
      retrieved.set("boolean", boolean);
      retrieved.set("nullValue", nullValue);
      retrieved.set("array", array);
      retrieved.set("object", object);
      // @ts-ignore
      expect(() => retrieved.set("undefinedValue", undefinedValue)).toThrow();
      // @ts-ignore
      expect(() => retrieved.set("functionValue", functionValue)).toThrow();

      // must successfuly serialize the nested structures
      retrieved.toJSON();
      expect(retrieved.get("crdtmap")).toBeInstanceOf(YjsMap);
      expect(retrieved.get("crdtarray")).toBeInstanceOf(YjsArray);
      expect(retrieved.get("crdttext")).toBeInstanceOf(YjsText);
      expect(retrieved.get("text")).toBe(text);
      expect(retrieved.get("number")).toBe(number);
      expect(retrieved.get("boolean")).toBe(boolean);
      expect(retrieved.get("nullValue")).toBe(nullValue);
      expect(retrieved.get("array")).toBe(array);
      expect(retrieved.get("object")).toBe(object);

      // Modify nested map
      (retrieved as YjsMap).set("key", "value");

      // Verify via original reference (should be same underlying Y.Map)
      expect((nestedMap as YjsMap).get("key")).toBe("value");
    });

    it("should support Array inside Map", () => {
      const nestedArray = yjsDoc.createDetachedArray();
      rootMap.set("list", nestedArray);

      const retrieved = rootMap.get("list");
      expect(retrieved).toBeInstanceOf(YjsArray);

      (retrieved as YjsArray).push("item");
      expect((nestedArray as YjsArray).get(0)).toBe("item");
    });

    it("should support Text inside Map", () => {
      const nestedText = yjsDoc.createDetachedText();
      rootMap.set("content", nestedText);

      const retrieved = rootMap.get("content");
      expect(retrieved).toBeInstanceOf(YjsText);

      (retrieved as YjsText).insert(0, "hello");
      expect((nestedText as YjsText).toString()).toBe("hello");
    });

    it("should support complex nesting", () => {
      // Map -> Array -> Map -> Text
      const array = yjsDoc.createDetachedArray();
      rootMap.set("array", array);

      const mapInArray = yjsDoc.createDetachedMap();
      (array as YjsArray).push(mapInArray);

      const textInMap = yjsDoc.createDetachedText();
      (mapInArray as YjsMap).set("text", textInMap);

      // Verify structure
      const retrievedArray = rootMap.get("array") as YjsArray;
      const retrievedMap = retrievedArray.get(0) as YjsMap;
      const retrievedText = retrievedMap.get("text") as YjsText;

      retrievedText.insert(0, "deeply nested");

      expect((textInMap as YjsText).toString()).toBe("deeply nested");
    });

    it("should support setting pre-populated structures", () => {
      const array = yjsDoc.createDetachedArray();
      array.push("pre-existing");

      rootMap.set("populated-array", array);

      const retrieved = rootMap.get("populated-array") as YjsArray;
      expect(retrieved.get(0)).toBe("pre-existing");
      expect(retrieved.length).toBe(1);
    });

    it("should handle overwriting existing keys with new instances", () => {
      const map1 = yjsDoc.createDetachedMap();
      map1.set("id", "1");
      rootMap.set("child", map1);

      expect((rootMap.get("child") as YjsMap).get("id")).toBe("1");

      const map2 = yjsDoc.createDetachedMap();
      map2.set("id", "2");
      rootMap.set("child", map2);

      expect((rootMap.get("child") as YjsMap).get("id")).toBe("2");
    });
  });
});
