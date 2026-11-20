/** @jest-environment ./jest-browser-environment.mjs */
import type { PanelInputRegistration } from "../types";
import type { InputRoot } from "@chulane/rivto-root";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";

it("keeps Page's mounted capability live while invalidating each routing registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  document.body.append(element);
  const pageRoots: Pick<InputRoot, "isAttached">[] = [];
  const registrations: PanelInputRegistration[] = [];
  panel.page.events.observe("page-root", { type: "click", priority: 0 }, (event) => {
    pageRoots.push(event.root);
  });
  panel.editor.events.register({ id: "routing-root", type: "click" }, (event) => {
    expect(event.inputRoot).toBe(panel.mountedRoot);
    registrations.push(event.inputRegistration);
  });
  try {
    panel.setRoot(element);
    element.click();
    expect(pageRoots[0].isAttached()).toBe(true);
    expect(registrations[0].isCurrent()).toBe(true);
    panel.setEnabled(false);
    expect(pageRoots[0].isAttached()).toBe(true);
    expect(registrations[0].isCurrent()).toBe(false);
    panel.setEnabled(true);
    element.click();
    expect(pageRoots[1]).toBe(pageRoots[0]);
    expect(registrations[1].isCurrent()).toBe(true);
    expect(registrations[0].isCurrent()).toBe(false);
    panel.setRoot(null);
    expect(pageRoots[0].isAttached()).toBe(false);
    expect(registrations[1].isCurrent()).toBe(false);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});
