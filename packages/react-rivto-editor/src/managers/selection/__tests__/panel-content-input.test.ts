/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("resolves only content owned by a rendered block in the receiving panel", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `
    <div data-block-id="container"><div data-block-id="child"><span data-block-content>child</span></div></div>
    <div data-block-id="nested-content"><div data-rivto-panel><span data-block-content>foreign</span></div></div>
    <div data-block-id="shared"><span data-block-content>outer</span></div>
    <div data-rivto-panel><div data-block-id="shared"><span data-block-content>nested</span></div></div>
  `;
  try {
    panel.setRoot(root);
    expect(panel.selection.contentInput("container")).toBeUndefined();
    expect(panel.selection.contentInput("nested-content")).toBeUndefined();
    expect(panel.selection.contentInput("missing")).toBeUndefined();
    expect(panel.selection.contentInput("child")?.readCaret().text).toBe("child");
    expect(panel.selection.contentInput("shared")?.readCaret().text).toBe("outer");
    panel.setEnabled(false);
    expect(panel.selection.contentInput("shared")).toBeUndefined();
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
