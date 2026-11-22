/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserRoutedEvents, BrowserInputRoot } from "@chulane/rivto-root/browser";
import { createTestCoreEditor } from "../../test-utils";
import { PanelRegistry } from "../panel-registry";

it("rejects a detached occurrence before notifying registration listeners", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const root = new BrowserInputRoot(document.createElement("div"));
  root.detach();
  let notifications = 0;
  registry.subscribeRoots(() => {
    notifications += 1;
  });
  try {
    expect(() => registry.registerPanel(root)).toThrow("Cannot register a detached input root");
    expect(notifications).toBe(0);
    expect(registry.getInputRoots().size).toBe(0);
  } finally {
    registry.destroy();
    await core.destroy();
  }
});

it("keeps the active surface mode during synchronous registration removal", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const surface = document.createElement("div");
  surface.dataset.rivtoPanel = "";
  surface.dataset.rivtoSurface = "edgeless";
  surface.tabIndex = 0;
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const release = registry.registerPanel(root);
  const listeners = new BrowserRoutedEvents(
    () => registry.getInputRoots(),
    (group, identity, capture, event, control) => {
      registry.resolveEventPanel(group.type, identity, capture, event, control);
    },
    [{ type: "focusin", target: "document", capture: false, passive: false }],
  );
  let modeDuringRemoval: string | undefined;
  const unsubscribe = registry.subscribeRoots(() => {
    modeDuringRemoval = registry.getSurfaceType();
  });
  try {
    listeners.reconcile();
    surface.focus();
    expect(registry.hasActivePanel()).toBe(true);
    release();
    expect(modeDuringRemoval).toBe("edgeless");
    expect(registry.getSurfaceType()).toBe("block");
  } finally {
    listeners.destroy();
    unsubscribe();
    release();
    registry.destroy();
    root.detach();
    surface.remove();
    await core.destroy();
  }
});

it("retains the replacement occurrence when the active surface is registered again", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const surface = document.createElement("div");
  surface.dataset.rivtoPanel = "";
  surface.dataset.rivtoSurface = "edgeless";
  surface.tabIndex = 0;
  document.body.append(surface);
  const original = new BrowserInputRoot(surface);
  const replacement = new BrowserInputRoot(surface);
  const releaseOriginal = registry.registerPanel(original);
  const listeners = new BrowserRoutedEvents(
    () => registry.getInputRoots(),
    (group, identity, capture, event, control) => {
      registry.resolveEventPanel(group.type, identity, capture, event, control);
    },
    [{ type: "focusin", target: "document", capture: false, passive: false }],
  );
  let releaseReplacement: (() => void) | undefined;
  let modeDuringRemoval: string | undefined;
  try {
    listeners.reconcile();
    surface.focus();
    releaseReplacement = registry.registerPanel(replacement);
    original.detach();
    const unsubscribe = registry.subscribeRoots(() => {
      modeDuringRemoval = registry.getSurfaceType();
    });
    releaseReplacement();
    unsubscribe();
    expect(modeDuringRemoval).toBe("edgeless");
  } finally {
    listeners.destroy();
    releaseReplacement?.();
    releaseOriginal();
    registry.destroy();
    original.detach();
    replacement.detach();
    surface.remove();
    await core.destroy();
  }
});
