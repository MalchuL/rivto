/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { CanvasEvents } from "./canvas-events";
import { Canvas } from "../core/canvas";
import { CanvasViewport } from "./canvas-viewport";
import { CanvasInputController } from "./canvas-input-controller";

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
  const detach = events.attach(root);
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
  const detach = events.attach(root);
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
  const detach = events.attach(root);
  root.click();
  window.dispatchEvent(new Event("blur"));
  expect(first).toHaveBeenCalledTimes(1);
  expect(global).toHaveBeenCalledTimes(1);
  detach();
  root.click();
  window.dispatchEvent(new Event("blur"));
  expect(first).toHaveBeenCalledTimes(1);
  expect(global).toHaveBeenCalledTimes(1);
  const detachAgain = events.attach(root);
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
  const detach = events.attach(root);
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
  const detach = viewport.attach(root, plane);
  const input = new CanvasInputController(canvas, root, viewport.events);
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
  expect(CanvasViewport.forElement(plane)).toBe(viewport);
  root.dispatchEvent(new WheelEvent("wheel", { deltaX: 20, deltaY: 30 }));
  expect(canvas.camera.get()).toEqual({ x: -20, y: -30, zoom: 1 });
  detach();
  expect(CanvasViewport.forElement(plane)).toBeUndefined();
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
  const stopParent = parent.attach(outer);
  const stopChild = child.attach(inner);
  inner.click();
  expect(childClick).toHaveBeenCalledTimes(1);
  expect(parentClick).not.toHaveBeenCalled();
  expect(() => new CanvasEvents().attach(inner)).toThrow("unattached root");
  stopChild();
  inner.click();
  expect(parentClick).toHaveBeenCalledTimes(1);
  stopParent();
});
