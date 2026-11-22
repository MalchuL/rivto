/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserRoutedEvents, BrowserInputRoot } from "@chulane/rivto-root/browser";
import { createTestCoreEditor } from "../../test-utils";
import type { PanelInputRegistration } from "../types";
import { PanelRegistry } from "../panel-registry";

it("keeps the previous routing index after a failed panel replacement", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const root = document.createElement("div");
  const mountedRoot = new BrowserInputRoot(root);
  root.dataset.rivtoPanel = "";
  const button = document.createElement("button");
  root.append(button);
  document.body.append(root);
  let previousRegistration: PanelInputRegistration | undefined;
  const release = registry.registerPanel(mountedRoot, {
    receiveInput: (registration) => {
      previousRegistration = registration;
    },
  });
  const previous = mountedRoot;
  const failure = new Error("replacement failed");
  const stop = registry.subscribeRoots(() => {
    if (!previousRegistration?.isCurrent()) {
      throw failure;
    }
  });
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
    expect(() => registry.registerPanel(mountedRoot)).toThrow(failure);
    listeners.reconcile();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(received).toBe(previous);
    expect(previous.isAttached()).toBe(true);
  } finally {
    listeners.destroy();
    stop();
    release();
    registry.destroy();
    mountedRoot.detach();
    root.remove();
    await core.destroy();
  }
});
