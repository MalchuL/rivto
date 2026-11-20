/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";

it("registers routing before notifying Page of focus already inside the surface", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = -1;
  document.body.append(root);
  let registeredAtFocus = false;
  panel.page.events.on("focus", () => {
    registeredAtFocus =
      panel.inputRoot !== undefined &&
      panel.editor.panels.getDefaultInputRoot() === panel.inputRoot;
  });
  try {
    root.focus();
    panel.setRoot(root);
    expect(registeredAtFocus).toBe(true);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("removes routing when Page's initial focus observer rejects attachment", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = -1;
  document.body.append(root);
  const unsubscribe = panel.page.events.on("focus", () => {
    throw new Error("focus observer failed");
  });
  try {
    root.focus();
    expect(() => panel.setRoot(root)).toThrow();
    expect(panel.editor.panels.getDefaultInputRoot()).toBeUndefined();
    expect(panel.page.inputRoot).toBeUndefined();
    unsubscribe();
    panel.setRoot(root);
    expect(panel.inputRoot).toBeDefined();
    expect(panel.editor.panels.getDefaultInputRoot()).toBe(panel.inputRoot);
  } finally {
    unsubscribe();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
