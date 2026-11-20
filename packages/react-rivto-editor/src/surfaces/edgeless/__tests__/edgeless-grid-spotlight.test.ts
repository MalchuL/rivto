/** @jest-environment jsdom */
const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest }).jest;
import { EdgelessGridSpotlight } from "../edgeless-grid-spotlight";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";

test("refreshes the viewport origin on ancestor scroll and resize and releases listeners on unmount", () => {
  const root = document.createElement("main");
  const overlay = document.createElement("div");
  root.append(overlay);
  const occurrence = new BrowserInputRoot(root);
  const viewport = occurrence.captureRegionByIdentity(getBrowserElementIdentity(root))!;
  const overlayRegion = occurrence.captureRegionByIdentity(getBrowserElementIdentity(overlay))!;
  const spotlight = new EdgelessGridSpotlight();
  const measure = jest.spyOn(root, "getBoundingClientRect");
  const release = spotlight.attach(
    occurrence,
    viewport,
    overlayRegion,
    occurrence.captureFrameClock()!,
  );
  measure.mockClear();
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
  expect(measure).toHaveBeenCalledTimes(2);
  release();
  measure.mockClear();
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
  expect(measure).not.toHaveBeenCalled();
  occurrence.detach();
});

test("coalesces pointer samples and does not paint while panning or after detachment", () => {
  const root = document.createElement("main");
  const overlay = document.createElement("div");
  root.append(overlay);
  const occurrence = new BrowserInputRoot(root);
  const viewport = occurrence.captureRegionByIdentity(getBrowserElementIdentity(root))!;
  const overlayRegion = occurrence.captureRegionByIdentity(getBrowserElementIdentity(overlay))!;
  const frames: (() => void)[] = [];
  const cancel = jest.fn();
  const clock = {
    requestFrame: (callback: () => void) => {
      frames.push(callback);
      return cancel;
    },
  };
  const spotlight = new EdgelessGridSpotlight();
  const release = spotlight.attach(occurrence, viewport, overlayRegion, clock);
  try {
    spotlight.updatePointerSpotlight({ clientX: 10, clientY: 20 });
    spotlight.updatePointerSpotlight({ clientX: 30, clientY: 40 });
    expect(frames).toHaveLength(1);
    frames[0]!();
    expect(overlay.style.getPropertyValue("--rivto-edgeless-pointer-x")).toBe("30px");
    expect(overlay.style.getPropertyValue("--rivto-edgeless-pointer-y")).toBe("40px");
    root.dataset.panning = "true";
    spotlight.updatePointerSpotlight({ clientX: 50, clientY: 60 });
    frames[1]!();
    expect(overlay.style.getPropertyValue("--rivto-edgeless-pointer-x")).toBe("30px");
    root.dataset.panning = "false";
    spotlight.updatePointerSpotlight({ clientX: 70, clientY: 80 });
    occurrence.detach();
    release();
    frames[2]!();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(overlay.style.getPropertyValue("--rivto-edgeless-pointer-x")).toBe("30px");
  } finally {
    release();
    occurrence.detach();
  }
});

test("cancels a frame if its occurrence is released while scheduling", () => {
  const root = document.createElement("main");
  const overlay = document.createElement("div");
  root.append(overlay);
  const occurrence = new BrowserInputRoot(root);
  const viewport = occurrence.captureRegionByIdentity(getBrowserElementIdentity(root))!;
  const overlayRegion = occurrence.captureRegionByIdentity(getBrowserElementIdentity(overlay))!;
  const spotlight = new EdgelessGridSpotlight();
  const cancel = jest.fn();
  let release = () => {};
  const clock = {
    requestFrame: () => {
      release();
      return cancel;
    },
  };
  release = spotlight.attach(occurrence, viewport, overlayRegion, clock);
  try {
    spotlight.updatePointerSpotlight({ clientX: 10, clientY: 20 });
    expect(cancel).toHaveBeenCalledTimes(1);
  } finally {
    release();
    occurrence.detach();
  }
});
