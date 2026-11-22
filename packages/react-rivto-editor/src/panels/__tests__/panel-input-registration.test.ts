/** @jest-environment ./jest-browser-environment.mjs */
import type { PanelInputRegistration } from "../types";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { BrowserInputRoot, BrowserRoutedEvents } from "@chulane/rivto-root/browser";
import { PanelRegistry } from "../panel-registry";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

test("keeps an old event registration invalid after routing is re-enabled on the same Root", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  surface.dataset.rivtoBlockEditor = "";
  document.body.append(surface);
  const registrations: PanelInputRegistration[] = [];
  panel.editor.events.register({ id: "capture-registration", type: "click" }, (event) => {
    registrations.push(event.inputRegistration);
  });
  try {
    panel.setRoot(surface);
    const mountedRoot = panel.mountedRoot;
    expect(panel.inputRoot === mountedRoot).toBe(true);
    surface.click();
    expect(registrations).toHaveLength(1);
    expect(registrations[0]!.isCurrent()).toBe(true);
    panel.setEnabled(false);
    expect(mountedRoot?.isAttached()).toBe(true);
    expect(registrations[0]!.isCurrent()).toBe(false);
    panel.setEnabled(true);
    surface.click();
    expect(panel.mountedRoot).toBe(mountedRoot);
    expect(registrations).toHaveLength(2);
    expect(registrations[1]).not.toBe(registrations[0]);
    expect(registrations[0]!.isCurrent()).toBe(false);
    expect(registrations[1]!.isCurrent()).toBe(true);
    expect(registrations[1]!.isCurrent(panel.inputRoot)).toBe(true);
    expect(registrations[1]!.isCurrent({ isAttached: () => true })).toBe(false);
    const action = jestApi.fn(() => true);
    const result = panel.selection.runWithViewportPreserved(
      [],
      { type: "selection", blocks: [] },
      panel.inputRoot!,
      registrations[0]!,
      action,
    );
    expect(result).toBe(false);
    expect(action).not.toHaveBeenCalled();
    const unrelated: PanelInputRegistration = {
      isCurrent: (root) => root !== panel.inputRoot,
    };
    expect(
      panel.selection.runWithViewportPreserved(
        [],
        { type: "selection", blocks: [] },
        panel.inputRoot!,
        unrelated,
        action,
      ),
    ).toBe(false);
    expect(action).not.toHaveBeenCalled();
  } finally {
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
  }
});

test("invalidates a failed staged registration and restores the earlier registration", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const surface = document.createElement("div");
  surface.dataset.rivtoPanel = "";
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const registrations: PanelInputRegistration[] = [];
  const release = registry.registerPanel(root);
  const listeners = new BrowserRoutedEvents(
    () => registry.getInputRoots(),
    (group, identity, capture, event, control) => {
      const route = registry.resolveEventPanel(group.type, identity, capture, event, control);
      if (route) {
        registrations.push(route.inputRegistration);
      }
    },
    [{ type: "click", target: "document", capture: false, passive: false }],
  );
  const stopListeners = registry.subscribeRoots(() => listeners.reconcile());
  let stop: (() => void) | undefined;
  try {
    listeners.reconcile();
    surface.click();
    const original = registrations[0]!;
    const failure = new Error("subscriber failed");
    let fail = true;
    stop = registry.subscribeRoots(() => {
      if (fail) {
        fail = false;
        surface.click();
        throw failure;
      }
    });
    expect(() => registry.registerPanel(root)).toThrow(failure);
    expect(registrations).toHaveLength(2);
    expect(registrations[1]).not.toBe(original);
    expect(registrations[1]!.isCurrent()).toBe(false);
    expect(original.isCurrent()).toBe(true);
  } finally {
    stop?.();
    stopListeners();
    listeners.destroy();
    release();
    registry.destroy();
    root.detach();
    await core.destroy();
    surface.remove();
  }
});
