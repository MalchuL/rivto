/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("attaches the Page occurrence as soon as its panel root is registered", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = document.createElement("div");
  const second = document.createElement("div");
  first.dataset.rivtoBlockEditor = "true";
  second.dataset.rivtoBlockEditor = "true";
  document.body.append(first, second);
  try {
    panel.setRoot(first);
    expect(panel.page.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(first));
    panel.setRoot(second);
    expect(panel.page.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(second));
    panel.setRoot(null);
    expect(panel.page.inputRoot).toBeUndefined();
  } finally {
    panel.editor.destroy();
    await core.destroy();
    first.remove();
    second.remove();
  }
});

it("rolls back the panel root when Page attachment fails and permits a retry", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
  const attach = jestApi.spyOn(panel.page.events, "attach").mockImplementationOnce(() => {
    throw new Error("attachment failed");
  });
  try {
    expect(() => panel.setRoot(root)).toThrow("attachment failed");
    expect(panel.hasInteractiveRoot()).toBe(false);
    expect(panel.page.inputRoot).toBeUndefined();
    panel.setRoot(root);
    expect(panel.page.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(root));
  } finally {
    attach.mockRestore();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("clears panel ownership after Page cleanup fails and permits another root", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = document.createElement("div");
  const second = document.createElement("div");
  first.dataset.rivtoBlockEditor = "true";
  second.dataset.rivtoBlockEditor = "true";
  const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
  const attach = jestApi.spyOn(panel.page.events, "attach").mockReturnValueOnce(() => {
    throw new Error("cleanup failed");
  });
  try {
    panel.setRoot(first);
    expect(() => panel.setRoot(null)).toThrow("Panel root cleanup failed");
    expect(panel.hasInteractiveRoot()).toBe(false);
    expect(panel.page.inputRoot).toBeUndefined();
    panel.setRoot(second);
    expect(panel.page.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(second));
  } finally {
    attach.mockRestore();
    panel.editor.destroy();
    await core.destroy();
  }
});
