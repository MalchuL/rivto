/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserRoutedEvents, BrowserInputRoot } from "@chulane/rivto-root/browser";
import { createTestCoreEditor } from "../../test-utils";
import { PanelRegistry } from "../panel-registry";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it.each([2, 40])("bounds ancestor lookups when routing among %i panels", async (count) => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const roots = Array.from({ length: count }, () => {
    const root = document.createElement("div");
    root.dataset.rivtoPanel = "";
    document.body.append(root);
    const mountedRoot = new BrowserInputRoot(root);
    registry.registerPanel(mountedRoot, core.getDocument());
    return { element: root, mountedRoot };
  });
  const button = document.createElement("button");
  roots.at(-1)!.element.append(button);
  const closest = jestApi.spyOn(button, "closest");
  let received: object | undefined;
  const listeners = new BrowserRoutedEvents(
    () => registry.getInputRoots(),
    (group, _root, capture, identity, control) => {
      received = registry.resolveEventPanel(
        group.type,
        undefined,
        capture,
        identity,
        control,
      )?.inputRoot;
    },
    [{ type: "click", target: "document", capture: false, passive: false }],
  );
  try {
    listeners.reconcile();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(received).toBe(roots.at(-1)!.mountedRoot);
    expect(closest.mock.calls.length).toBeLessThanOrEqual(2);
  } finally {
    listeners.destroy();
    closest.mockRestore();
    registry.destroy();
    roots.forEach(({ element, mountedRoot }) => {
      mountedRoot.detach();
      element.remove();
    });
    await core.destroy();
  }
});
