/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserRoutedEvents, BrowserInputRoot } from "@chulane/rivto-root/browser";
import { createTestCoreEditor } from "../../test-utils";
import { PanelRegistry } from "../panel-registry";

it.each(["deactivation", "selection clearing"])(
  "keeps a nested activation during %s",
  async (stage) => {
    const core = await createTestCoreEditor();
    let activateNested = false;
    let activateNestedPanel = () => {};
    const registry = new PanelRegistry(
      {
        clear: () => {
          core.selection.clear();
          if (stage === "selection clearing" && activateNested) {
            activateNested = false;
            activateNestedPanel();
          }
        },
      },
      { assertActive: () => {} },
    );
    const elements = Array.from({ length: 3 }, () => {
      const element = document.createElement("div");
      element.dataset.rivtoPanel = "";
      document.body.append(element);
      return element;
    });

    const roots = elements.map((element) => new BrowserInputRoot(element));
    activateNestedPanel = () => {
      elements[2].dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    };
    const releases = roots.map((root, index) =>
      registry.registerPanel(root, core.getDocument(), undefined, undefined, () => {
        if (index === 0 && stage === "deactivation" && activateNested) {
          activateNested = false;
          activateNestedPanel();
        }
      }),
    );
    const delivered: object[] = [];
    const listeners = new BrowserRoutedEvents(
      () => registry.getInputRoots(),
      (group, identity, capture, event, control) => {
        const route = registry.resolveEventPanel(group.type, identity, capture, event, control);
        if (route) {
          delivered.push(route.inputRoot);
        }
      },
      [{ type: "focusin", target: "document", capture: false, passive: false }],
    );
    try {
      listeners.reconcile();
      elements[0].dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      delivered.length = 0;
      activateNested = true;
      elements[1].dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      expect(registry.getActiveInputRoot()).toBe(roots[2]);
      expect(delivered).toEqual([roots[2]]);
    } finally {
      listeners.destroy();
      releases.forEach((release) => release());
      registry.destroy();
      roots.forEach((root) => root.detach());
      elements.forEach((element) => element.remove());
      await core.destroy();
    }
  },
);

it("does not deliver an old input to a replacement registration", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const elements = Array.from({ length: 2 }, () => {
    const element = document.createElement("div");
    element.dataset.rivtoPanel = "";
    document.body.append(element);
    return element;
  });
  const roots = elements.map((element) => new BrowserInputRoot(element));
  let replace = false;
  let releaseReplacement: (() => void) | undefined;
  const releases = roots.map((root, index) =>
    registry.registerPanel(root, core.getDocument(), undefined, undefined, () => {
      if (index === 0 && replace) {
        replace = false;
        releaseReplacement = registry.registerPanel(roots[1], core.getDocument());
      }
    }),
  );
  const delivered: object[] = [];
  const listeners = new BrowserRoutedEvents(
    () => registry.getInputRoots(),
    (group, identity, capture, event, control) => {
      const route = registry.resolveEventPanel(group.type, identity, capture, event, control);
      if (route) {
        delivered.push(route.inputRoot);
      }
    },
    [{ type: "focusin", target: "document", capture: false, passive: false }],
  );
  try {
    listeners.reconcile();
    elements[0].dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    delivered.length = 0;
    replace = true;
    elements[1].dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(registry.getActiveInputRoot()).toBe(roots[0]);
    expect(delivered).toEqual([]);
  } finally {
    listeners.destroy();
    releaseReplacement?.();
    releases.forEach((release) => release());
    registry.destroy();
    roots.forEach((root) => root.detach());
    elements.forEach((element) => element.remove());
    await core.destroy();
  }
});
