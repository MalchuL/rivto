/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { PanelInputRegistration } from "../types";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";

it("keeps Page attached while disabling routing and invalidates the old input registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  const deliveries: PanelInputRegistration[] = [];
  panel.editor.events.register({ id: "observe-registration", type: "click" }, (event) => {
    deliveries.push(event.inputRegistration);
  });
  try {
    panel.setRoot(root);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(deliveries).toHaveLength(1);
    const first = deliveries[0];
    expect(first.isCurrent()).toBe(true);

    panel.setEnabled(false);
    expect(panel.page.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(root));
    expect(first.isCurrent()).toBe(false);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(deliveries).toHaveLength(1);

    panel.setEnabled(true);
    expect(panel.page.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(root));
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(deliveries).toHaveLength(2);
    expect(deliveries[1]).not.toBe(first);
    expect(deliveries[1].isCurrent()).toBe(true);
    expect(first.isCurrent()).toBe(false);

    panel.setRoot(null);
    expect(panel.page.inputRoot).toBeUndefined();
    expect(deliveries[1].isCurrent()).toBe(false);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
