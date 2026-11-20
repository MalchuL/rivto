/** @jest-environment jsdom */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { attachTestBrowserEvents } from "../../test-utils/attach-test-browser-events";
import { jest } from "@jest/globals";
import { CanvasEvents, type CanvasEventMap } from "../canvas-events";
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../canvas-viewport";
import { canvasViewportForElement } from "../canvas-viewport-attachment";
import { CanvasInputController } from "../canvas-input-controller";

test("orders handlers, claims group delivery and leaves default prevention explicit", () => {
  const events = new CanvasEvents();
  const root = document.createElement("main");
  const calls: string[] = [];
  events.register({
    id: "default",
    type: "click",
    handle: () => {
      calls.push("default");
    },
  });
  const release = events.register({
    id: "extension",
    type: "click",
    priority: 10,
    handle: () => {
      calls.push("extension");
      return "handled";
    },
  });
  const detach = attachTestBrowserEvents(events, root);
  const event = new MouseEvent("click", { cancelable: true });
  root.dispatchEvent(event);
  expect(calls).toEqual(["extension"]);
  expect(event.defaultPrevented).toBe(false);
  release();
  root.dispatchEvent(new MouseEvent("click"));
  expect(calls).toEqual(["extension", "default"]);
  detach();
});

test("removal during dispatch skips callbacks and additions wait for the next event", () => {
  const events = new CanvasEvents();
  const root = document.createElement("main");
  const calls: string[] = [];
  let removeLater = () => {};
  let registered = false;
  events.register({
    id: "first",
    type: "click",
    handle: () => {
      removeLater();
      if (!registered) {
        registered = true;
        events.register({
          id: "added",
          type: "click",
          handle: () => {
            calls.push("added");
          },
        });
      }
    },
  });
  removeLater = events.register({
    id: "later",
    type: "click",
    handle: () => {
      calls.push("removed");
    },
  });
  const detach = attachTestBrowserEvents(events, root);
  root.click();
  expect(calls).toEqual([]);
  root.click();
  expect(calls).toEqual(["added"]);
  detach();
});

test("releases root and window listeners and protects a later attachment from stale cleanup", () => {
  const events = new CanvasEvents();
  const root = document.createElement("main");
  const first = jest.fn<() => void>();
  const global = jest.fn<() => void>();
  events.register({ id: "root", type: "click", handle: first });
  events.register({ id: "window", type: "blur", target: "window", handle: global });
  const detach = attachTestBrowserEvents(events, root);
  root.click();
  window.dispatchEvent(new Event("blur"));
  expect(first).toHaveBeenCalledTimes(1);
  expect(global).toHaveBeenCalledTimes(1);
  detach();
  root.click();
  window.dispatchEvent(new Event("blur"));
  expect(first).toHaveBeenCalledTimes(1);
  expect(global).toHaveBeenCalledTimes(1);
  const detachAgain = attachTestBrowserEvents(events, root);
  detach();
  root.click();
  expect(first).toHaveBeenCalledTimes(2);
  detachAgain();
});

test("rejects invalid identities and restores registration after failed native setup", () => {
  const events = new CanvasEvents();
  const root = document.createElement("main");
  const registration = { id: "click", type: "click" as const, handle: () => {} };
  expect(() => events.register({ ...registration, id: " " })).toThrow("unique ID");
  expect(() => events.register({ ...registration, priority: NaN })).toThrow("finite priority");
  const release = events.register(registration);
  expect(() => events.register(registration)).toThrow("unique ID");
  release();
  const detach = attachTestBrowserEvents(events, root);
  const native = jest.spyOn(root, "addEventListener").mockImplementationOnce(() => {
    throw new Error("native setup");
  });
  expect(() => events.register(registration)).toThrow("native setup");
  native.mockRestore();
  expect(() => events.register(registration)).not.toThrow();
  detach();
});

test("custom wheel registration overrides built-in panning and removal restores it", () => {
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  const root = document.createElement("main");
  const plane = document.createElement("div");
  root.append(plane);
  const inputRoot = new BrowserInputRoot(root);
  const detach = viewport.attach(root, plane, inputRoot);
  const input = new CanvasInputController(canvas, viewport.events, inputRoot);
  const stop = input.connect();
  const override = viewport.events.register({
    id: "host.wheel",
    type: "wheel",
    priority: 1,
    handle: (event) => {
      event.preventDefault();
      return "handled";
    },
  });
  root.dispatchEvent(new WheelEvent("wheel", { deltaX: 20, deltaY: 30, cancelable: true }));
  expect(canvas.camera.get()).toEqual({ x: 0, y: 0, zoom: 1 });
  override();
  root.dispatchEvent(new WheelEvent("wheel", { deltaX: 20, deltaY: 30, cancelable: true }));
  expect(canvas.camera.get()).toEqual({ x: -20, y: -30, zoom: 1 });
  stop();
  expect(canvasViewportForElement(plane)).toBe(viewport);
  root.dispatchEvent(new WheelEvent("wheel", { deltaX: 20, deltaY: 30 }));
  expect(canvas.camera.get()).toEqual({ x: -20, y: -30, zoom: 1 });
  detach();
  inputRoot.detach();
  expect(canvasViewportForElement(plane)).toBeUndefined();
  canvas.dispose();
});

test("nested attached canvas roots isolate root handlers while sharing their window", () => {
  const outer = document.createElement("main");
  const inner = document.createElement("main");
  outer.append(inner);
  const parent = new CanvasEvents();
  const child = new CanvasEvents();
  const parentClick = jest.fn<() => void>();
  const childClick = jest.fn<() => void>();
  parent.register({ id: "parent", type: "click", handle: parentClick });
  child.register({ id: "child", type: "click", handle: childClick });
  const stopParent = attachTestBrowserEvents(parent, outer);
  const stopChild = attachTestBrowserEvents(child, inner);
  inner.click();
  expect(childClick).toHaveBeenCalledTimes(1);
  expect(parentClick).not.toHaveBeenCalled();
  expect(() => attachTestBrowserEvents(new CanvasEvents(), inner)).toThrow("unattached root");
  stopChild();
  inner.click();
  expect(parentClick).toHaveBeenCalledTimes(1);
  stopParent();
});

test("detaches all listeners and viewport ownership when one native removal fails", () => {
  const canvas = new Canvas();
  const viewport = new CanvasViewport(canvas);
  const root = document.createElement("main");
  const plane = document.createElement("div");
  root.append(plane);
  const handler = jest.fn<() => void>();
  viewport.events.register({ id: "click", type: "click", handle: handler });
  viewport.events.register({ id: "input", type: "input", handle: handler });
  const detach = viewport.attach(root, plane);
  const remove = root.removeEventListener.bind(root);
  const spy = jest
    .spyOn(root, "removeEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "click") {
        throw new Error("remove failed");
      }
      remove(type, listener, options);
    });
  expect(detach).toThrow(AggregateError);
  expect(spy.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(["click", "input"]));
  expect(viewport.isAttached()).toBe(false);
  expect(canvasViewportForElement(root)).toBeUndefined();
  root.click();
  root.dispatchEvent(new Event("input"));
  expect(handler).not.toHaveBeenCalled();
  spy.mockRestore();
  const detachAgain = viewport.attach(root, plane);
  detach();
  root.dispatchEvent(new Event("input"));
  expect(handler).toHaveBeenCalledTimes(1);
  detachAgain();
  canvas.dispose();
});

test("preserves attachment and rollback failures", () => {
  const events = new CanvasEvents();
  const root = document.createElement("main");
  events.register({ id: "click", type: "click", handle: () => {} });
  events.register({ id: "input", type: "input", handle: () => {} });
  const add = root.addEventListener.bind(root);
  const setupError = new Error("setup failure");
  const rollbackError = new Error("rollback failure");
  const addSpy = jest
    .spyOn(root, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "input") {
        throw setupError;
      }
      add(type, listener, options);
    });
  const removeSpy = jest.spyOn(root, "removeEventListener").mockImplementation(() => {
    throw rollbackError;
  });
  let failure: unknown;
  try {
    attachTestBrowserEvents(events, root);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toContain(setupError);
  addSpy.mockRestore();
  removeSpy.mockRestore();
  const detach = attachTestBrowserEvents(events, root);
  detach();
});

test("delivers normalized input and capabilities without exposing browser objects", () => {
  const events = new CanvasEvents();
  const root = document.createElement("main");
  const target = document.createElement("button");
  target.dataset.canvasElement = "item-1";
  root.append(target);
  let received: CanvasEventMap["click"] | undefined;
  events.register({
    id: "normalized-click",
    type: "click",
    handle: (event) => {
      received = event;
      event.preventDefault();
    },
  });
  const detach = attachTestBrowserEvents(events, root);
  const native = new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 25 });
  target.dispatchEvent(native);
  expect(received).toBeDefined();
  expect(received).not.toBe(native);
  expect(received?.clientX).toBe(25);
  expect(received?.target?.hasAncestor("button")).toBe(true);
  expect(received?.target?.ancestorAttribute("button", "data-canvas-element")).toBe("item-1");
  expect(received?.target).not.toBe(target);
  expect(native.defaultPrevented).toBe(true);
  detach();
});
