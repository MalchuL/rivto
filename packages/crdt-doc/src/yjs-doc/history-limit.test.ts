import * as Y from "yjs";
import { YjsUndoManager } from "./yjs-undo-manager";

/**
 * Creates a nested block for the offline history regression.
 *
 * @param text - Initial text content.
 * @param value - Initial map value.
 * @returns A block ready to be integrated into a document.
 */
function createBlock(text: string, value: string): Y.Map<unknown> {
  const block = new Y.Map<unknown>();
  block.set("text", new Y.Text(text));
  block.set("value", value);
  return block;
}

/**
 * Exchanges full updates twice between each pair of documents.
 *
 * @param docs - Peers whose updates should be exchanged.
 * @returns Every ordered pair has exchanged its current state twice.
 */
function syncPeers(docs: Y.Doc[]): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const source of docs) {
      for (const target of docs) {
        if (source !== target) {
          Y.applyUpdate(target, Y.encodeStateAsUpdate(source), "remote");
        }
      }
    }
  }
}

test("coalesces history trimming into one timer and cancels pending work", () => {
  jest.useFakeTimers();
  const doc = new Y.Doc();
  const map = doc.getMap("values");
  const manager = new Y.UndoManager(map, { captureTimeout: 0 });
  const history = new YjsUndoManager(manager, 1);
  try {
    map.set("value", 1);
    map.set("value", 2);
    map.set("value", 3);
    expect(manager.undoStack).toHaveLength(3);
    expect(jest.getTimerCount()).toBe(1);
    jest.runOnlyPendingTimers();
    expect(manager.undoStack).toHaveLength(1);
    map.set("value", 4);
    expect(jest.getTimerCount()).toBe(1);
    history.clear();
    expect(jest.getTimerCount()).toBe(0);
    map.set("value", 5);
    map.set("value", 6);
    expect(jest.getTimerCount()).toBe(1);
    history.destroy();
    map.set("value", 7);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    history.destroy();
    doc.destroy();
    jest.useRealTimers();
  }
});

test("uses an idle callback and flushes it before an immediate history operation", () => {
  const request = jest.fn(() => 17);
  const cancel = jest.fn();
  const originalRequest = Object.getOwnPropertyDescriptor(globalThis, "requestIdleCallback");
  const originalCancel = Object.getOwnPropertyDescriptor(globalThis, "cancelIdleCallback");
  Object.defineProperty(globalThis, "requestIdleCallback", { configurable: true, value: request });
  Object.defineProperty(globalThis, "cancelIdleCallback", { configurable: true, value: cancel });
  const doc = new Y.Doc();
  const map = doc.getMap("values");
  const manager = new Y.UndoManager(map, { captureTimeout: 0 });
  const history = new YjsUndoManager(manager, 1);
  try {
    map.set("value", 1);
    map.set("value", 2);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.any(Function), { timeout: 1_000 });
    expect(manager.undoStack).toHaveLength(2);
    history.undo();
    expect(cancel).toHaveBeenCalledWith(17);
    expect(manager.undoStack).toHaveLength(0);
    expect(map.get("value")).toBe(1);
  } finally {
    history.destroy();
    doc.destroy();
    if (originalRequest) {
      Object.defineProperty(globalThis, "requestIdleCallback", originalRequest);
    } else {
      Reflect.deleteProperty(globalThis, "requestIdleCallback");
    }
    if (originalCancel) {
      Object.defineProperty(globalThis, "cancelIdleCallback", originalCancel);
    } else {
      Reflect.deleteProperty(globalThis, "cancelIdleCallback");
    }
  }
});

test("cancels pending trimming when the underlying document is destroyed", () => {
  jest.useFakeTimers();
  const doc = new Y.Doc();
  const map = doc.getMap("values");
  const manager = new Y.UndoManager(map, { captureTimeout: 0 });
  const history = new YjsUndoManager(manager, 1);
  try {
    map.set("value", 1);
    map.set("value", 2);
    expect(jest.getTimerCount()).toBe(1);
    doc.destroy();
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    history.destroy();
    jest.useRealTimers();
  }
});

test.each([undefined, 0, 1])(
  "releases history after document destruction with limit %s",
  (limit) => {
    const doc = new Y.Doc();
    const manager = new Y.UndoManager(doc.getMap("values"));
    const history = new YjsUndoManager(manager, limit);
    doc.destroy();
    expect(() => history.undo()).toThrow("destroyed");
    expect(() => history.redo()).toThrow("destroyed");
    expect(() => history.clear()).toThrow("destroyed");
    expect(() => history.stopCapturing()).toThrow("destroyed");
    expect(() => history.destroy()).not.toThrow();
  },
);

test("preserves a native undo history after its transaction observer is detached", () => {
  const doc = new Y.Doc();
  const map = doc.getMap("values");
  const history = new YjsUndoManager(new Y.UndoManager(map, { captureTimeout: 0 }), 1);
  const other = new Y.UndoManager(map, { captureTimeout: 0 });
  try {
    map.set("value", "retained");
    map.delete("value");
    history.clear();
    doc.off("afterTransaction", other.afterTransactionHandler);
    expect(doc._observers.get("afterTransaction")?.size).toBe(1);
    other.undo();
    expect(map.get("value")).toBe("retained");
  } finally {
    history.destroy();
    other.destroy();
    doc.destroy();
  }
});

test("merges offline nested edits after bounded history eviction", () => {
  jest.useFakeTimers();
  const docs = [17, 23, 31].map((clientID) => {
    const doc = new Y.Doc();
    doc.clientID = clientID;
    return doc;
  });
  const [first, second, third] = docs;
  const roots = docs.map((doc) => doc.getMap<Y.Map<unknown>>("root"));
  const [firstRoot, secondRoot, thirdRoot] = roots;
  const managers = roots.map(
    (root) => new Y.UndoManager(root, { captureTimeout: 0, trackedOrigins: new Set(["local"]) }),
  );
  const histories = managers.map((manager) => new YjsUndoManager(manager, 5));
  try {
    first.transact(() => firstRoot.set("block", createBlock("original", "original")), "init");
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first), "remote");
    Y.applyUpdate(third, Y.encodeStateAsUpdate(first), "remote");
    second.transact(() => secondRoot.delete("block"), "local");
    Y.applyUpdate(third, Y.encodeStateAsUpdate(second), "remote");
    third.transact(() => thirdRoot.set("block", createBlock("new-2", "restart-80")), "local");
    first.transact(() => firstRoot.get("block")!.set("value", "0-92"), "local");
    Y.applyUpdate(third, Y.encodeStateAsUpdate(first), "remote");
    first.transact(() => firstRoot.get("block")!.set("value", "0-96"), "local");
    Y.applyUpdate(first, Y.encodeStateAsUpdate(third), "remote");
    Y.applyUpdate(second, Y.encodeStateAsUpdate(third), "remote");
    for (const value of ["0-115", "0-117", "0-120"]) {
      first.transact(() => firstRoot.get("block")!.set("value", value), "local");
    }
    const text = firstRoot.get("block")!.get("text") as Y.Text;
    first.transact(() => text.delete(4, 1), "local");
    jest.runOnlyPendingTimers();
    first.transact(() => text.insert(3, "0"), "local");
    jest.runOnlyPendingTimers();
    expect(managers[0].undoStack).toHaveLength(5);
    syncPeers(docs);
    for (const root of roots) {
      expect(root.toJSON()).toEqual({ block: { text: "new0-", value: "0-120" } });
    }
  } finally {
    histories.forEach((history) => history.destroy());
    docs.forEach((doc) => doc.destroy());
    jest.useRealTimers();
  }
});

// The current Yjs representation retains each redo payload; safe collection is unresolved.
test.skip("bounds retained payload during repeated undo and redo", () => {
  const doc = new Y.Doc();
  const text = doc.getText("content");
  const history = new YjsUndoManager(new Y.UndoManager(text, { captureTimeout: 0 }), 10);
  try {
    const payload = "x".repeat(512);
    text.insert(0, payload);
    for (let index = 0; index < 250; index++) {
      history.undo();
      history.redo();
    }
    expect(text.toString()).toBe(payload);
    const bytes = Y.encodeStateAsUpdate(doc).byteLength;
    history.undo();
    expect(text.toString()).toBe("");
    history.redo();
    expect(text.toString()).toBe(payload);
    expect(bytes).toBeLessThan(20_000);
  } finally {
    history.destroy();
    doc.destroy();
  }
});
