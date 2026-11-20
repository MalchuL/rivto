/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../../../../test-utils";
import { registerCaretNavigation } from "../register";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not navigate a replacement occurrence from an earlier keyboard event", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoSurface = "block";
  document.body.append(root);
  registerCaretNavigation(panel.editor);
  const read = jestApi.spyOn(panel.selection, "readDOM");
  panel.editor.keyboard.register({ id: "replace-root", keys: "ArrowUp", priority: 100 }, () => {
    panel.setRoot(null);
    panel.setRoot(root);
    return false;
  });
  try {
    panel.setRoot(root);
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(read).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
