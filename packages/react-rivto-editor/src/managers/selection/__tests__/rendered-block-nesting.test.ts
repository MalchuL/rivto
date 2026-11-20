/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("checks rendered nesting within the receiving panel without mounting blocks", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "";
  root.innerHTML = `
    <div data-block-id="parent">
      <div data-block-id="child"></div>
      <div data-rivto-panel><div data-block-id="embedded"></div></div>
    </div>`;
  try {
    panel.setRoot(root);
    expect(panel.selection.isRenderedBlockNested("parent")).toBe(false);
    expect(panel.selection.isRenderedBlockNested("child")).toBe(true);
    expect(panel.selection.isRenderedBlockNested("embedded")).toBe(false);
    expect(panel.selection.isRenderedBlockNested("missing")).toBe(false);
    panel.setRoot(null);
    expect(panel.selection.isRenderedBlockNested("child")).toBe(false);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
