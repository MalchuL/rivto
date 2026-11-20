/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import type { PanelInputRegistration } from "../../../panels/types";

it("keeps event and keyboard attachment checks bound to their registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "event-attachment";
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoSurface = "block";
  document.body.append(root);
  const registrations: PanelInputRegistration[] = [];
  panel.editor.events.register({ id: "attachment-click", type: "click" }, (event) => {
    registrations.push(event.inputRegistration);
  });
  panel.editor.keyboard.register({ id: "attachment-key", keys: ["Escape"] }, (event) => {
    registrations.push(event.inputRegistration);
  });
  try {
    panel.setRoot(root);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(registrations).toHaveLength(2);
    expect(registrations[0]).toBe(registrations[1]);
    expect(registrations.map((registration) => registration.isCurrent())).toEqual([true, true]);
    panel.setRoot(null);
    panel.setRoot(root);
    expect(registrations.map((registration) => registration.isCurrent())).toEqual([false, false]);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(registrations[2]!.isCurrent()).toBe(true);
    panel.setEnabled(false);
    expect(registrations[2]!.isCurrent()).toBe(false);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
