/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot, BrowserRoutedEvents } from "@chulane/rivto-root/browser";
import { createTestCoreEditor } from "../../test-utils";
import { PanelRegistry } from "../panel-registry";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

test("withdraws routing and deactivates the panel when selection cleanup fails", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const surface = document.createElement("div");
  surface.dataset.rivtoPanel = "";
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const failure = new Error("selection cleanup failed");
  const deactivate = jestApi.fn();
  const release = registry.registerPanel(root, {
    deactivate,
    cancelSelection: () => {
      throw failure;
    },
  });
  const listeners = new BrowserRoutedEvents(
    () => registry.getInputRoots(),
    (group, identity, capture, event, control) => {
      registry.resolveEventPanel(group.type, identity, capture, event, control);
    },
    [{ type: "focusin", target: "document", capture: false, passive: false }],
  );
  const notify = jestApi.fn(() => listeners.reconcile());
  const unsubscribe = registry.subscribeRoots(notify);
  try {
    listeners.reconcile();
    surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(registry.hasActivePanel()).toBe(true);
    expect(release).toThrow(failure);
    expect(registry.getInputRoots().size).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(registry.hasActivePanel()).toBe(false);
  } finally {
    unsubscribe();
    listeners.destroy();
    registry.destroy();
    root.detach();
    surface.remove();
    await core.destroy();
  }
});

test("reports multiple cleanup failures after notifying every root subscriber", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const surface = document.createElement("div");
  const root = new BrowserInputRoot(surface);
  const selectionFailure = new Error("selection failed");
  const notificationFailure = new Error("notification failed");
  const deactivationFailure = new Error("deactivation failed");
  const release = registry.registerPanel(root, {
    deactivate: () => {
      throw deactivationFailure;
    },
    cancelSelection: () => {
      throw selectionFailure;
    },
  });
  const notify = jestApi.fn();
  const stopFailing = registry.subscribeRoots(() => {
    throw notificationFailure;
  });
  const stopFollowing = registry.subscribeRoots(notify);
  try {
    let caught: unknown;
    try {
      release();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([
      selectionFailure,
      notificationFailure,
      deactivationFailure,
    ]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(registry.getInputRoots().size).toBe(0);
  } finally {
    stopFailing();
    stopFollowing();
    registry.destroy();
    root.detach();
    await core.destroy();
  }
});

test("retains a replacement registered before selection cleanup throws", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const surface = document.createElement("div");
  surface.dataset.rivtoPanel = "";
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const failure = new Error("selection cleanup failed");
  let releaseReplacement: (() => void) | undefined;
  const release = registry.registerPanel(root, {
    cancelSelection: () => {
      releaseReplacement = registry.registerPanel(root);
      throw failure;
    },
  });
  const listeners = new BrowserRoutedEvents(
    () => registry.getInputRoots(),
    (group, identity, capture, event, control) => {
      registry.resolveEventPanel(group.type, identity, capture, event, control);
    },
    [{ type: "focusin", target: "document", capture: false, passive: false }],
  );
  const unsubscribe = registry.subscribeRoots(() => listeners.reconcile());
  try {
    listeners.reconcile();
    surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(registry.hasActivePanel()).toBe(true);
    expect(release).toThrow(failure);
    expect(registry.getActiveInputRoot()).toBe(root);
    expect(registry.getActiveInputRoot()?.isAttached()).toBe(true);
  } finally {
    unsubscribe();
    listeners.destroy();
    releaseReplacement?.();
    registry.destroy();
    root.detach();
    surface.remove();
    await core.destroy();
  }
});

test("notifies later subscribers during failed registration and its rollback", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const root = new BrowserInputRoot(document.createElement("div"));
  const failure = new Error("notification failed");
  const notify = jestApi.fn();
  const stopFailing = registry.subscribeRoots(() => {
    throw failure;
  });
  const stopFollowing = registry.subscribeRoots(notify);
  try {
    let caught: unknown;
    try {
      registry.registerPanel(root);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([failure, failure]);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(registry.getInputRoots().size).toBe(0);
  } finally {
    stopFailing();
    stopFollowing();
    registry.destroy();
    root.detach();
    await core.destroy();
  }
});
