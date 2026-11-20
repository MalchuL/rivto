/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { mountThreadOverlay } from "../mount-thread-overlay";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import type { PanelInputRegistration } from "../../../panels/types";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("removes a partially mounted path when size observation is unavailable", () => {
  const surface = document.createElement("div");
  surface.className = "page-surface";
  document.body.append(surface);
  const inputRoot = new BrowserInputRoot(surface);
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: undefined });
  try {
    expect(() =>
      mountThreadOverlay(
        { inputRoot, subscribeAvailability: () => () => {} },
        inputRoot,
        { anchor: () => undefined },
        { isCurrent: (root) => root?.isAttached() ?? false },
      ),
    ).toThrow("ResizeObserver is not available");
    expect(document.querySelector("[data-bullet-threading]")).toBeNull();
  } finally {
    if (previous) {
      Object.defineProperty(window, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(window, "ResizeObserver");
    }
    inputRoot.detach();
    surface.remove();
  }
});

it("removes the overlay synchronously when the panel registration expires", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  surface.className = "page-surface";
  document.body.append(surface);
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  const disconnect = jestApi.fn();
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: jestApi.fn().mockImplementation(() => ({ observe: () => {}, disconnect })),
  });
  let stop: (() => void) | undefined;
  try {
    panel.setRoot(surface);
    stop = mountThreadOverlay(
      panel,
      panel.inputRoot!,
      { anchor: () => undefined },
      panel.inputRegistration!,
    );
    expect(document.querySelectorAll("[data-bullet-threading]")).toHaveLength(1);
    panel.setEnabled(false);
    expect(panel.mountedRoot?.isAttached()).toBe(true);
    expect(document.querySelectorAll("[data-bullet-threading]")).toHaveLength(0);
    expect(disconnect).toHaveBeenCalled();
  } finally {
    stop?.();
    panel.editor.destroy();
    await core.destroy();
    if (previous) {
      Object.defineProperty(window, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(window, "ResizeObserver");
    }
    surface.remove();
  }
});

it("releases only the old overlay when the Root is replaced on the same surface", () => {
  const surface = document.createElement("div");
  surface.className = "page-surface";
  surface.dataset.rivtoPanel = "";
  document.body.append(surface);
  const first = new BrowserInputRoot(surface);
  const panel = { inputRoot: first, subscribeAvailability: () => () => {} };
  const registration: PanelInputRegistration = { isCurrent: (root) => root?.isAttached() ?? false };
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  const Observer = jestApi
    .fn()
    .mockImplementation(() => ({ observe: () => {}, disconnect: () => {} }));
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: Observer });
  let second: BrowserInputRoot | undefined;
  let stopFirst: (() => void) | undefined;
  let stopSecond: (() => void) | undefined;
  try {
    stopFirst = mountThreadOverlay(panel, first, { anchor: () => undefined }, registration);
    expect(document.querySelectorAll("[data-bullet-threading]")).toHaveLength(1);
    first.detach();
    second = new BrowserInputRoot(surface);
    panel.inputRoot = second;
    stopSecond = mountThreadOverlay(panel, second, { anchor: () => undefined }, registration);
    expect(document.querySelectorAll("[data-bullet-threading]")).toHaveLength(2);
    stopFirst?.();
    expect(document.querySelectorAll("[data-bullet-threading]")).toHaveLength(1);
  } finally {
    stopFirst?.();
    stopSecond?.();
    if (previous) {
      Object.defineProperty(window, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(window, "ResizeObserver");
    }
    first.detach();
    second?.detach();
    surface.remove();
  }
});

it("replaces an expired registration without removing the new overlay on the same Root", () => {
  const surface = document.createElement("div");
  surface.className = "page-surface";
  document.body.append(surface);
  const inputRoot = new BrowserInputRoot(surface);
  const listeners = new Set<() => void>();
  const panel = {
    inputRoot,
    subscribeAvailability: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  let firstCurrent = true;
  const firstRegistration: PanelInputRegistration = { isCurrent: () => firstCurrent };
  const secondRegistration: PanelInputRegistration = { isCurrent: () => true };
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: jestApi.fn().mockImplementation(() => ({ observe: () => {}, disconnect: () => {} })),
  });
  let stopFirst: (() => void) | undefined;
  let stopSecond: (() => void) | undefined;
  try {
    stopFirst = mountThreadOverlay(
      panel,
      inputRoot,
      { anchor: () => undefined },
      firstRegistration,
    );
    firstCurrent = false;
    listeners.forEach((listener) => listener());
    expect(document.querySelectorAll("[data-bullet-threading]")).toHaveLength(0);
    stopSecond = mountThreadOverlay(
      panel,
      inputRoot,
      { anchor: () => undefined },
      secondRegistration,
    );
    stopFirst?.();
    expect(document.querySelectorAll("[data-bullet-threading]")).toHaveLength(1);
    expect(inputRoot.isAttached()).toBe(true);
  } finally {
    stopFirst?.();
    stopSecond?.();
    if (previous) {
      Object.defineProperty(window, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(window, "ResizeObserver");
    }
    inputRoot.detach();
    surface.remove();
  }
});
