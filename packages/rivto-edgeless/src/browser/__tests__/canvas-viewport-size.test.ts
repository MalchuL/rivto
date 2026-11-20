/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../canvas-viewport";
import { observeCanvasViewportSize } from "../canvas-viewport-size";

it("measures only the current Root and releases observers on replacement", () => {
  const callbacks: ResizeObserverCallback[] = [];
  const disconnect = jest.fn();
  const previous = mockResizeObserver(callbacks, disconnect);
  const element = document.createElement("div");
  const plane = document.createElement("div");
  element.append(plane);
  document.body.append(element);
  Object.defineProperty(element, "clientWidth", { configurable: true, value: 200 });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: 100 });
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  const setViewport = jest.fn<(width: number, height: number) => void>();
  const stop = observeCanvasViewportSize({ setViewport }, viewport);
  const first = new BrowserInputRoot(element);
  let second: BrowserInputRoot | undefined;
  let detachSecond: (() => void) | undefined;
  try {
    expect(setViewport).not.toHaveBeenCalled();
    const detachFirst = viewport.attach(element, plane, first);
    expect(setViewport).toHaveBeenLastCalledWith(200, 100);
    expect(callbacks).toHaveLength(1);
    detachFirst();
    expect(disconnect).toHaveBeenCalledTimes(1);
    Object.defineProperty(element, "clientWidth", { configurable: true, value: 320 });
    second = new BrowserInputRoot(element);
    detachSecond = viewport.attach(element, plane, second);
    expect(setViewport).toHaveBeenLastCalledWith(320, 100);
    expect(callbacks).toHaveLength(2);
    const calls = setViewport.mock.calls.length;
    callbacks[0]!([], {} as ResizeObserver);
    expect(setViewport).toHaveBeenCalledTimes(calls);
    Object.defineProperty(element, "clientHeight", { configurable: true, value: 140 });
    callbacks[1]!([], {} as ResizeObserver);
    expect(setViewport).toHaveBeenLastCalledWith(320, 140);
    stop();
    expect(disconnect).toHaveBeenCalledTimes(2);
    callbacks[1]!([], {} as ResizeObserver);
    expect(setViewport).toHaveBeenCalledTimes(calls + 1);
  } finally {
    stop();
    detachSecond?.();
    first.detach();
    second?.detach();
    element.remove();
    restoreResizeObserver(previous);
  }
});

it("does not install a stale observer when initial measurement detaches the Root", () => {
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  const Observer = jest.fn();
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: Observer });
  const element = document.createElement("div");
  const plane = document.createElement("div");
  element.append(plane);
  document.body.append(element);
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  const root = new BrowserInputRoot(element);
  const setViewport = jest.fn(() => root.detach());
  const stop = observeCanvasViewportSize({ setViewport }, viewport);
  let detach: (() => void) | undefined;
  try {
    detach = viewport.attach(element, plane, root);
    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(Observer).not.toHaveBeenCalled();
  } finally {
    stop();
    detach?.();
    root.detach();
    element.remove();
    restoreResizeObserver(previous);
  }
});

it("rolls back a failed size observer and accepts a later attachment", () => {
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  const disconnect = jest.fn();
  const observe = jest.fn<() => void>().mockImplementationOnce(() => {
    throw new Error("size observation failed");
  });
  const Observer = jest.fn<() => ResizeObserver>().mockImplementation(() => ({
    observe,
    unobserve: jest.fn(),
    disconnect,
  }));
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: Observer });
  const element = document.createElement("div");
  const plane = document.createElement("div");
  element.append(plane);
  document.body.append(element);
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  const root = new BrowserInputRoot(element);
  const stop = observeCanvasViewportSize(canvas, viewport);
  let detach: (() => void) | undefined;
  try {
    expect(() => viewport.attach(element, plane, root)).toThrow("size observation failed");
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(viewport.isAttached()).toBe(false);
    detach = viewport.attach(element, plane, root);
    expect(viewport.isAttached()).toBe(true);
    expect(observe).toHaveBeenCalledTimes(2);
  } finally {
    stop();
    detach?.();
    root.detach();
    element.remove();
    restoreResizeObserver(previous);
  }
});

/**
 * Restores the window's previous size observer after a fixture completes.
 *
 * @param previous - Original own property descriptor, if one existed.
 * @returns The test observer has been removed or replaced by the original.
 */
function restoreResizeObserver(previous: PropertyDescriptor | undefined): void {
  if (previous) {
    Object.defineProperty(window, "ResizeObserver", previous);
  } else {
    Reflect.deleteProperty(window, "ResizeObserver");
  }
}

/**
 * Installs a size observer that retains callbacks for later stale-delivery checks.
 *
 * @param callbacks - Collects each registered observer callback.
 * @param disconnect - Records releases of captured observers.
 * @returns The previous window property for restoration after the fixture.
 */
function mockResizeObserver(
  callbacks: ResizeObserverCallback[],
  disconnect: () => void,
): PropertyDescriptor | undefined {
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  const Observer = jest
    .fn<(callback: ResizeObserverCallback) => ResizeObserver>()
    .mockImplementation((callback) => {
      callbacks.push(callback);
      return { observe: jest.fn(), unobserve: jest.fn(), disconnect };
    });
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: Observer });
  return previous;
}
