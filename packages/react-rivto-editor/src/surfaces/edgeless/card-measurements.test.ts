/** @jest-environment jsdom */
const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest }).jest;
import { Canvas } from "@chulane/rivto-edgeless";
import { CardMeasurements } from "./card-measurements";

test("coalesces dirty cards, bounds measurement mounts per frame and releases pins on teardown", () => {
  const canvas = new Canvas({ overscan: 0 });
  const observer = globalThis.ResizeObserver;
  const disconnect = jest.fn();
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: jest.fn(() => ({ observe: jest.fn(), disconnect })),
  });
  jest.useFakeTimers();
  try {
    canvas.setViewport(100, 100);
    const ids = ["a", "b", "c", "removed", "later"];
    canvas.setElements(
      ids.map((id) => ({
        id,
        rotation: 0,
        zIndex: 0,
        frame: { x: id === "later" ? 1000 : 0, y: -1000, width: 80, height: 20 },
      })),
    );
    const queue = new CardMeasurements(canvas);
    const release = queue.connect(document.createElement("main"));
    for (const id of [...ids, ...ids]) {
      queue.invalidate(id);
    }
    queue.remove("removed");
    expect(canvas.visible.get()).toEqual([]);
    jest.advanceTimersToNextTimer();
    expect(canvas.visible.get()).toEqual(["a", "b"]);
    jest.advanceTimersToNextTimer();
    expect(canvas.visible.get()).toEqual(["c"]);
    jest.advanceTimersToNextTimer();
    expect(canvas.visible.get()).toEqual([]);
    canvas.setCamera({ x: -1000, y: 0, zoom: 1 });
    jest.advanceTimersToNextTimer();
    expect(canvas.visible.get()).toEqual(["later"]);
    release();
    expect(canvas.visible.get()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(1);
  } finally {
    canvas.dispose();
    jest.useRealTimers();
    if (observer) {
      Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: observer });
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  }
});
