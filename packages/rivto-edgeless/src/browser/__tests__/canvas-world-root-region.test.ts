/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../canvas-viewport";
import { canvasViewportAttachment } from "../canvas-viewport-attachment";

it("borrows the Root-captured world region and invalidates it after replacement", () => {
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  const occurrence = new BrowserInputRoot(root);
  const capture = jest.spyOn(occurrence, "captureRegionByIdentity");
  const viewport = new CanvasViewport(new Canvas());
  const detach = viewport.attach(root, plane, occurrence);
  const region = canvasViewportAttachment(viewport).get()!.worldRegion;
  try {
    expect(capture).toHaveBeenCalledWith(getBrowserElementIdentity(plane), expect.any(Function));
    expect(region).toBe(capture.mock.results[1]!.value);
    expect(region.getIdentity()).toBe(getBrowserElementIdentity(plane));
    detach();
    const detachReplacement = viewport.attach(root, plane, occurrence);
    try {
      expect(region.getIdentity()).toBeUndefined();
      expect(canvasViewportAttachment(viewport).get()!.worldRegion.getIdentity()).toBe(
        getBrowserElementIdentity(plane),
      );
    } finally {
      detachReplacement();
    }
  } finally {
    detach();
    occurrence.detach();
  }
});

it("keeps a replacement mounted when Root capture reenters attachment", () => {
  const root = document.createElement("div");
  const plane = document.createElement("div");
  const otherRoot = document.createElement("div");
  const otherPlane = document.createElement("div");
  root.append(plane);
  otherRoot.append(otherPlane);
  const occurrence = new BrowserInputRoot(root);
  const viewport = new CanvasViewport(new Canvas());
  const capture = occurrence.captureRegionByIdentity.bind(occurrence);
  let detachReplacement: (() => void) | undefined;
  const spy = jest
    .spyOn(occurrence, "captureRegionByIdentity")
    .mockImplementationOnce((...args) => {
      const region = capture(...args);
      detachReplacement = viewport.attach(otherRoot, otherPlane);
      return region;
    });
  try {
    expect(() => viewport.attach(root, plane, occurrence)).toThrow("mounted owner");
    expect(canvasViewportAttachment(viewport).get()!.root).toBe(otherRoot);
    expect(occurrence.isAttached()).toBe(true);
  } finally {
    spy.mockRestore();
    detachReplacement?.();
    occurrence.detach();
  }
});

it("rolls back a viewport whose Root cannot capture its world region", () => {
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  const occurrence = new BrowserInputRoot(root);
  const viewport = new CanvasViewport(new Canvas());
  const captureRegion = occurrence.captureRegionByIdentity.bind(occurrence);
  const capture = jest
    .spyOn(occurrence, "captureRegionByIdentity")
    .mockImplementationOnce((...args) => captureRegion(...args))
    .mockReturnValueOnce(undefined);
  try {
    expect(() => viewport.attach(root, plane, occurrence)).toThrow("world layer");
    expect(viewport.isAttached()).toBe(false);
    expect(occurrence.isAttached()).toBe(true);
    const detach = viewport.attach(root, plane, occurrence);
    detach();
  } finally {
    capture.mockRestore();
    occurrence.detach();
  }
});

it("requests focus through the borrowed Root and stops after its attachment ends", () => {
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  const occurrence = new BrowserInputRoot(root);
  const focus = jest.spyOn(occurrence, "focus");
  const viewport = new CanvasViewport(new Canvas());
  const detach = viewport.attach(root, plane, occurrence);
  const layers = canvasViewportAttachment(viewport).get()!;
  try {
    layers.focus();
    expect(focus).toHaveBeenCalledTimes(1);
    detach();
    layers.focus();
    expect(focus).toHaveBeenCalledTimes(1);
  } finally {
    detach();
    occurrence.detach();
  }
});

it("rolls back a viewport whose Root cannot capture the viewport region", () => {
  const root = document.createElement("div");
  const plane = document.createElement("div");
  root.append(plane);
  const occurrence = new BrowserInputRoot(root);
  const viewport = new CanvasViewport(new Canvas());
  const capture = jest.spyOn(occurrence, "captureRegionByIdentity").mockReturnValueOnce(undefined);
  try {
    expect(() => viewport.attach(root, plane, occurrence)).toThrow("Canvas viewport is not owned");
    expect(viewport.isAttached()).toBe(false);
    expect(occurrence.isAttached()).toBe(true);
    const detach = viewport.attach(root, plane, occurrence);
    detach();
  } finally {
    capture.mockRestore();
    occurrence.detach();
  }
});
