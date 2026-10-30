/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { Canvas } from "../core/canvas";
import { CanvasViewport } from "./canvas-viewport";
import { CanvasInputController } from "./canvas-input-controller";

/**
 * Creates an attached input owner with browser capture and animation-frame mocks.
 *
 * @returns Scene, native pointer delivery and complete fixture cleanup.
 */
function setup() {
  jest.useFakeTimers();
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  const root = document.createElement("main");
  const plane = document.createElement("div");
  root.append(plane);
  document.body.append(root);
  root.setPointerCapture = jest.fn();
  root.hasPointerCapture = () => true;
  root.releasePointerCapture = jest.fn();
  const detach = viewport.attach(root, plane);
  const disconnect = new CanvasInputController(canvas, root, viewport.events).connect();
  return {
    canvas,
    root,
    disconnect,
    /**
     * Delivers a native-like sample through the actual attached listener chain.
     *
     * @param type - Pointer lifecycle event name.
     * @param x - Client x coordinate in CSS pixels.
     * @param pointerId - Contact identity; defaults to the active mouse.
     * @returns The sample has reached the input owner.
     */
    pointer(type: string, x: number, pointerId = 1) {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 1,
        clientX: x,
      });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      root.dispatchEvent(event);
    },
    /**
     * Releases input, DOM attachment and mocked browser scheduling.
     *
     * @returns No fixture listener, timer or mounted root remains.
     */
    destroy() {
      disconnect();
      detach();
      root.remove();
      jest.useRealTimers();
    },
  };
}

test("publishes the first pan sample immediately and coalesces subsequent high-rate input", () => {
  const fixture = setup();
  const changed = jest.fn();
  const unsubscribe = fixture.canvas.camera.subscribe(changed);
  try {
    fixture.pointer("pointerdown", 10);
    for (let x = 11; x <= 110; x++) {
      fixture.pointer("pointermove", x);
    }
    expect(changed).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(16);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(fixture.canvas.camera.get().x).toBe(100);
    fixture.pointer("pointermove", 120);
    fixture.pointer("pointerup", 125);
    expect(fixture.canvas.camera.get().x).toBe(115);
    expect(changed).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    unsubscribe();
    fixture.destroy();
  }
});

for (const exit of ["pointercancel", "blur", "Escape", "detach"]) {
  test(`discards pending pan work on ${exit} and ignores unrelated contacts`, () => {
    const fixture = setup();
    try {
      fixture.pointer("pointerdown", 10);
      fixture.pointer("pointermove", 20);
      fixture.pointer("pointermove", 50);
      fixture.pointer("pointercancel", 100, 2);
      expect(jest.getTimerCount()).toBe(1);
      if (exit === "blur") {
        window.dispatchEvent(new Event("blur"));
      } else if (exit === "Escape") {
        fixture.root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } else if (exit === "detach") {
        fixture.disconnect();
      } else {
        fixture.pointer("pointercancel", 50);
      }
      jest.advanceTimersByTime(32);
      expect(fixture.canvas.camera.get().x).toBe(10);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      fixture.destroy();
    }
  });
}

test("publishes the first pan movement without waiting for a frame or reading layout", () => {
  const fixture = setup();
  const measure = jest.spyOn(fixture.root, "getBoundingClientRect");
  try {
    fixture.pointer("pointerdown", 10);
    fixture.pointer("pointermove", 10);
    fixture.pointer("pointermove", 15);
    expect(fixture.canvas.camera.get().x).toBe(5);
    expect(measure).not.toHaveBeenCalled();
  } finally {
    fixture.destroy();
  }
});

test("fast trackpad samples follow input immediately through acceleration and reversal", () => {
  const fixture = setup();
  try {
    let x = 0;
    let y = 0;
    for (const [deltaX, deltaY] of [
      [0.5, 1.5],
      [48, 72],
      [80.25, 100.5],
      [-12, -16],
    ]) {
      fixture.root.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY }));
      x -= deltaX;
      y -= deltaY;
      expect(fixture.canvas.camera.get()).toEqual({ x, y, zoom: 1 });
      expect(jest.getTimerCount()).toBe(0);
    }
  } finally {
    fixture.destroy();
  }
});

test("shows intermediate camera positions for a mouse-wheel step and reaches its exact target", () => {
  const fixture = setup();
  const changed = jest.fn();
  const stop = fixture.canvas.camera.subscribe(changed);
  try {
    fixture.root.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 6.25, deltaMode: 1, cancelable: true }),
    );
    expect(fixture.canvas.camera.get().y).toBeLessThan(0);
    expect(fixture.canvas.camera.get().y).toBeGreaterThan(-100);
    jest.advanceTimersByTime(500);
    expect(fixture.canvas.camera.get().y).toBe(-100);
    expect(changed.mock.calls.length).toBeLessThanOrEqual(12);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    stop();
    fixture.destroy();
  }
});

test("applies fractional trackpad deltas directly without losing a pending wheel target", () => {
  const fixture = setup();
  try {
    fixture.root.dispatchEvent(new WheelEvent("wheel", { deltaX: 0.25, deltaY: 1.5 }));
    expect(fixture.canvas.camera.get()).toEqual({ x: -0.25, y: -1.5, zoom: 1 });
    expect(jest.getTimerCount()).toBe(0);
    fixture.root.dispatchEvent(new WheelEvent("wheel", { deltaY: 7.5, deltaMode: 1 }));
    const before = fixture.canvas.camera.get();
    fixture.root.dispatchEvent(new WheelEvent("wheel", { deltaX: 0.5, deltaY: -0.25 }));
    expect(fixture.canvas.camera.get().x).toBe(before.x - 0.5);
    expect(fixture.canvas.camera.get().y).toBe(before.y + 0.25);
    jest.advanceTimersByTime(500);
    expect(fixture.canvas.camera.get()).toEqual({ x: -0.75, y: -121.25, zoom: 1 });
  } finally {
    fixture.destroy();
  }
});

for (const exit of ["pointerdown", "blur", "Escape", "detach", "zoom"]) {
  test(`stops pending wheel movement on ${exit}`, () => {
    const fixture = setup();
    try {
      fixture.root.dispatchEvent(new WheelEvent("wheel", { deltaY: 7.5, deltaMode: 1 }));
      expect(jest.getTimerCount()).toBe(1);
      if (exit === "pointerdown") {
        fixture.pointer("pointerdown", 10);
      } else if (exit === "blur") {
        window.dispatchEvent(new Event("blur"));
      } else if (exit === "Escape") {
        fixture.root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } else if (exit === "zoom") {
        fixture.root.dispatchEvent(new WheelEvent("wheel", { deltaY: -10, ctrlKey: true }));
      } else {
        fixture.disconnect();
      }
      const stopped = fixture.canvas.camera.get();
      jest.advanceTimersByTime(500);
      expect(fixture.canvas.camera.get()).toEqual(stopped);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      fixture.destroy();
    }
  });
}

test("accumulates coarse wheel events without losing displacement", () => {
  const fixture = setup();
  try {
    fixture.root.dispatchEvent(
      new WheelEvent("wheel", { deltaX: 6.25, deltaY: 7.5, deltaMode: 1 }),
    );
    fixture.root.dispatchEvent(
      new WheelEvent("wheel", { deltaX: -2.5, deltaY: -1.25, deltaMode: 1 }),
    );
    jest.advanceTimersByTime(500);
    expect(fixture.canvas.camera.get()).toEqual({ x: -60, y: -100, zoom: 1 });
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    fixture.destroy();
  }
});

for (const mode of [1, 2]) {
  test(`converts wheel delta mode ${mode} into viewport pixels`, () => {
    const fixture = setup();
    try {
      fixture.root.style.lineHeight = "20px";
      Object.defineProperties(fixture.root, {
        clientWidth: { value: 600 },
        clientHeight: { value: 400 },
      });
      fixture.root.dispatchEvent(
        new WheelEvent("wheel", { deltaX: 1, deltaY: 2, deltaMode: mode }),
      );
      jest.advanceTimersByTime(500);
      const expected = mode === 1 ? { x: -20, y: -40 } : { x: -600, y: -800 };
      expect(fixture.canvas.camera.get()).toMatchObject(expected);
    } finally {
      fixture.destroy();
    }
  });
}

test("settles finite large coordinates without overflow or an endless animation", () => {
  const fixture = setup();
  try {
    fixture.canvas.setCamera({ x: 1.5e308, y: 0, zoom: 1 });
    fixture.root.dispatchEvent(new WheelEvent("wheel", { deltaX: 6.25e306, deltaMode: 1 }));
    fixture.root.dispatchEvent(new WheelEvent("wheel", { deltaX: 9.375e306, deltaMode: 1 }));
    jest.advanceTimersByTime(2000);
    expect(fixture.canvas.camera.get().x).toBe(5e307 - 1.5e308);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    fixture.destroy();
  }
});
