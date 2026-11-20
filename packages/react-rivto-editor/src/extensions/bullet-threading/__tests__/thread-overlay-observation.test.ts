/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { observeThreadOverlay } from "../thread-overlay-observation";
import type { BulletThreadingAnchor } from "../types";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("rejects an anchor outside the current occurrence and releases observation", () => {
  const { surface, foreign, foreignRoot, foreignRegion } = createThreadFixture();
  const inputRoot = new BrowserInputRoot(surface);
  const { overlay, path } = createPath(inputRoot);
  const { disconnect, restoreObserver } = mockSizeObservation();
  const frames = mockFrames();
  const anchor = jestApi.fn((block: Parameters<BulletThreadingAnchor>[0]) => {
    expect(block).not.toBeInstanceOf(Element);
    return foreignRegion;
  });
  try {
    const stop = observeThreadOverlay({
      inputRoot,
      inputRegistration: { isCurrent: (root) => root?.isAttached() ?? false },
      overlay,
      anchor,
      rootLineOffset: 12,
      excluded: new Set(),
      continued: null,
    });
    frames.run();
    expect(anchor).toHaveBeenCalled();
    expect(path.getAttribute("d")).toBe("");
    path.setAttribute("d", "previous");
    const second = surface.querySelectorAll("button")[1]!;
    anchor.mockImplementation(() => {
      second.focus();
      return foreignRegion;
    });
    window.dispatchEvent(new Event("resize"));
    frames.run();
    expect(path.getAttribute("d")).toBe("previous");
    anchor.mockImplementation(() => {
      inputRoot.detach();
      return foreignRegion;
    });
    window.dispatchEvent(new Event("resize"));
    frames.run();
    expect(path.getAttribute("d")).toBe("previous");
    stop();
    expect(disconnect).toHaveBeenCalledTimes(1);
  } finally {
    frames.restore();
    restoreObserver();
    overlay.remove();
    inputRoot.detach();
    foreignRoot.detach();
    surface.remove();
    foreign.remove();
  }
});

it("does not measure a queued frame after its registration expires while the Root remains attached", () => {
  const { surface, foreign, foreignRoot, foreignRegion } = createThreadFixture();
  const inputRoot = new BrowserInputRoot(surface);
  const { overlay, path } = createPath(inputRoot);
  const { restoreObserver } = mockSizeObservation();
  const frames = mockFrames();
  const anchor = jestApi.fn(() => foreignRegion);
  let current = true;
  const inputRegistration = { isCurrent: () => current };
  try {
    const stop = observeThreadOverlay({
      inputRoot,
      inputRegistration,
      overlay,
      anchor,
      rootLineOffset: 12,
      excluded: new Set(),
      continued: null,
    });
    path.setAttribute("d", "previous");
    current = false;
    expect(inputRoot.isAttached()).toBe(true);
    frames.run();
    expect(anchor).not.toHaveBeenCalled();
    expect(path.getAttribute("d")).toBe("previous");
    stop();
  } finally {
    frames.restore();
    restoreObserver();
    overlay.remove();
    inputRoot.detach();
    foreignRoot.detach();
    surface.remove();
    foreign.remove();
  }
});

it("does not write a path when registration expires during anchor measurement", () => {
  const { surface, foreign, foreignRoot, foreignRegion } = createThreadFixture();
  const inputRoot = new BrowserInputRoot(surface);
  const { overlay, path } = createPath(inputRoot);
  const { restoreObserver } = mockSizeObservation();
  const frames = mockFrames();
  let current = true;
  const inputRegistration = { isCurrent: () => current };
  const anchor = jestApi.fn(() => {
    current = false;
    return foreignRegion;
  });
  try {
    const stop = observeThreadOverlay({
      inputRoot,
      inputRegistration,
      overlay,
      anchor,
      rootLineOffset: 12,
      excluded: new Set(),
      continued: null,
    });
    path.setAttribute("d", "previous");
    frames.run();
    expect(anchor).toHaveBeenCalled();
    expect(inputRoot.isAttached()).toBe(true);
    expect(path.getAttribute("d")).toBe("previous");
    stop();
  } finally {
    frames.restore();
    restoreObserver();
    overlay.remove();
    inputRoot.detach();
    foreignRoot.detach();
    surface.remove();
    foreign.remove();
  }
});

/**
 * Creates the Root-owned path used by the observation fixture.
 *
 * @param root - Mounted occurrence owning the overlay.
 * @returns The overlay capability and its DOM path for assertions.
 */
function createPath(root: BrowserInputRoot) {
  const overlay = root.createPathOverlay({
    className: "test-path",
    attributes: { "data-test-path": "true" },
  });
  expect(overlay.create()).toBe(true);
  return { overlay, path: document.querySelector("svg[data-test-path] path")! };
}

/**
 * Captures frame requests so the fixture can run or release them explicitly.
 *
 * @returns Frame execution and browser spy cleanup operations.
 */
function mockFrames() {
  let frame: FrameRequestCallback | undefined;
  const request = jestApi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  const cancel = jestApi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  return {
    /**
     * Runs the latest scheduled frame.
     *
     * @returns The retained callback has been invoked when present.
     */
    run: () => frame?.(0),
    /**
     * Restores both browser frame methods.
     *
     * @returns The fixture's frame spies are removed.
     */
    restore: () => {
      request.mockRestore();
      cancel.mockRestore();
    },
  };
}

/**
 * Mounts a focused block and a foreign region.
 *
 * @returns Browser nodes and the foreign Root and region owned by the fixture.
 */
function createThreadFixture() {
  const surface = document.createElement("div");
  const block = document.createElement("div");
  const button = document.createElement("button");
  const second = document.createElement("button");
  const foreign = document.createElement("div");
  surface.dataset.rivtoPanel = "";
  block.dataset.blockId = "block";
  block.append(button, second);
  surface.append(block);
  document.body.append(surface, foreign);
  button.focus();
  const foreignRoot = new BrowserInputRoot(foreign);
  const foreignRegion = foreignRoot.captureRegionByIdentity(getBrowserElementIdentity(foreign))!;
  return { surface, foreign, foreignRoot, foreignRegion };
}

/**
 * Replaces the window's size observer with one that records cleanup.
 *
 * @returns Disconnect spy and a function restoring the previous constructor.
 */
function mockSizeObservation() {
  const disconnect = jestApi.fn();
  const Observer = jestApi.fn().mockImplementation(() => ({ observe: () => {}, disconnect }));
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: Observer });
  return {
    disconnect,
    restoreObserver: () => {
      if (previous) {
        Object.defineProperty(window, "ResizeObserver", previous);
      } else {
        Reflect.deleteProperty(window, "ResizeObserver");
      }
    },
  };
}
