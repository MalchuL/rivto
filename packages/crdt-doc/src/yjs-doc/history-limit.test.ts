import * as Y from "yjs";
import { YjsUndoManager } from "./yjs-undo-manager";

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
