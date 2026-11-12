/** @jest-environment jsdom */
const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest }).jest;
import { EdgelessGridSpotlight } from "./edgeless-grid-spotlight";
import type { PointerEvent as ReactPointerEvent } from "react";

test("refreshes the viewport origin on ancestor scroll and resize and releases listeners on unmount", () => {
  const root = document.createElement("main");
  const spotlight = new EdgelessGridSpotlight(() => false);
  spotlight.viewport = root;
  const measure = jest.spyOn(root, "getBoundingClientRect");
  const release = spotlight.observeViewport();
  measure.mockClear();
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
  expect(measure).toHaveBeenCalledTimes(2);
  release();
  measure.mockClear();
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
  expect(measure).not.toHaveBeenCalled();
});

test("skips spotlight paint while the live gesture check is active", () => {
  jest.useFakeTimers();
  let active = true;
  const spotlight = new EdgelessGridSpotlight(() => active);
  spotlight.viewport = document.createElement("main");
  const overlay = document.createElement("div");
  spotlight.spotlightOverlay = overlay;
  const event = { clientX: 40, clientY: 25 } as ReactPointerEvent<HTMLElement>;
  try {
    spotlight.updatePointerSpotlight(event);
    jest.advanceTimersByTime(20);
    expect(overlay.style.getPropertyValue("--rivto-edgeless-pointer-x")).toBe("");
    active = false;
    spotlight.updatePointerSpotlight(event);
    jest.advanceTimersByTime(20);
    expect(overlay.style.getPropertyValue("--rivto-edgeless-pointer-x")).toBe("40px");
  } finally {
    jest.useRealTimers();
  }
});
