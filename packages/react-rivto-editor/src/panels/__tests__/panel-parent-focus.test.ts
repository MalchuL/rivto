/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserRoutedEvents, BrowserInputRoot } from "@chulane/rivto-root/browser";
import { createTestCoreEditor } from "../../test-utils";
import { PanelRegistry } from "../panel-registry";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("restores focus through the mounted Root when a nested panel unregisters", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const parent = document.createElement("div");
  const child = document.createElement("div");
  const input = document.createElement("input");
  parent.dataset.rivtoPanel = "";
  child.dataset.rivtoPanel = "";
  parent.tabIndex = 0;
  parent.append(child);
  child.append(input);
  document.body.append(parent);
  const parentRoot = new BrowserInputRoot(parent);
  const childRoot = new BrowserInputRoot(child);
  const findParent = jestApi.spyOn(childRoot, "getParentIdentity");
  const releaseParent = registry.registerPanel(parentRoot);
  const releaseChild = registry.registerPanel(childRoot);
  const listeners = new BrowserRoutedEvents(
    () => registry.getInputRoots(),
    (group, root, capture, identity, control) => {
      registry.resolveEventPanel(group.type, root, capture, identity, control);
    },
    [{ type: "focusin", target: "document", capture: false, passive: false }],
  );
  try {
    listeners.reconcile();
    input.focus();
    expect(document.activeElement).toBe(input);
    releaseChild();
    expect(findParent).toHaveBeenCalledWith("[data-rivto-panel]");
    expect(document.activeElement).toBe(parent);
    expect(childRoot.isAttached()).toBe(true);
  } finally {
    listeners.destroy();
    releaseChild();
    releaseParent();
    childRoot.detach();
    parentRoot.detach();
    registry.destroy();
    parent.remove();
    await core.destroy();
  }
});
