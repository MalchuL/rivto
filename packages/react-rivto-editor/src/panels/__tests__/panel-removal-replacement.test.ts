/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserRoutedEvents, BrowserInputRoot } from "@chulane/rivto-root/browser";
import { createTestCoreEditor } from "../../test-utils";
import { PanelRegistry } from "../panel-registry";

it.each(["selection cancellation", "root notification", "deactivation"])(
  "retains a replacement registered during %s",
  async (stage) => {
    const core = await createTestCoreEditor();
    const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
    const surface = document.createElement("div");
    surface.dataset.rivtoPanel = "";
    document.body.append(surface);
    const root = new BrowserInputRoot(surface);
    let replacing = false;
    let releaseReplacement: (() => void) | undefined;
    const replace = () => {
      if (replacing) {
        replacing = false;
        releaseReplacement = registry.registerPanel(root);
      }
    };
    const release = registry.registerPanel(root, {
      deactivate: stage === "deactivation" ? replace : undefined,
      cancelSelection: stage === "selection cancellation" ? replace : undefined,
    });
    const unsubscribe = registry.subscribeRoots(() => {
      if (stage === "root notification") {
        replace();
      }
    });
    const listeners = new BrowserRoutedEvents(
      () => registry.getInputRoots(),
      (group, identity, capture, event, control) => {
        registry.resolveEventPanel(group.type, identity, capture, event, control);
      },
      [{ type: "focusin", target: "document", capture: false, passive: false }],
    );
    try {
      listeners.reconcile();
      surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      expect(registry.getActiveInputRoot()).toBe(root);
      replacing = true;
      release();
      expect(registry.getActiveInputRoot()).toBe(root);
      expect(registry.getActiveInputRoot()).toBeDefined();
    } finally {
      listeners.destroy();
      unsubscribe();
      releaseReplacement?.();
      release();
      registry.destroy();
      root.detach();
      surface.remove();
      await core.destroy();
    }
  },
);

it("keeps a new pointer gesture started by a replacement during selection cleanup", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const elements = Array.from({ length: 2 }, () => {
    const element = document.createElement("div");
    element.dataset.rivtoPanel = "";
    document.body.append(element);
    return element;
  });
  const roots = elements.map((element) => new BrowserInputRoot(element));
  let releaseReplacement: (() => void) | undefined;
  let replace = false;
  const release = registry.registerPanel(roots[0], {
    cancelSelection: () => {
      if (replace) {
        replace = false;
        releaseReplacement = registry.registerPanel(roots[0]);
        elements[0].dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      }
    },
  });
  const releaseOther = registry.registerPanel(roots[1]);
  let received: object | undefined;
  const groups = [
    { type: "pointerdown", target: "document" as const, capture: false, passive: false },
    { type: "pointermove", target: "window" as const, capture: false, passive: false },
  ];
  const listeners = new BrowserRoutedEvents(
    () => registry.getInputRoots(),
    (group, identity, capture, event, control) => {
      const route = registry.resolveEventPanel(group.type, identity, capture, event, control);
      if (group.type === "pointermove") {
        received = route?.inputRoot;
      }
    },
    groups,
  );
  const unsubscribe = registry.subscribeRoots(() => listeners.reconcile());
  try {
    listeners.reconcile();
    elements[0].dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    replace = true;
    release();
    elements[1].dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(received).toBe(roots[0]);
  } finally {
    unsubscribe();
    listeners.destroy();
    releaseReplacement?.();
    releaseOther();
    release();
    registry.destroy();
    roots.forEach((root) => root.detach());
    elements.forEach((element) => element.remove());
    await core.destroy();
  }
});
