/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../../../../test-utils";
import { registerBackwardBlockMerge } from "../register";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not read a replacement occurrence while evaluating an earlier key event", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content contenteditable="true">text</span></div>`;
  document.body.append(root);
  registerBackwardBlockMerge(panel.editor);
  panel.editor.keyboard.register({ id: "replace-root", keys: "Backspace", priority: 100 }, () => {
    panel.setRoot(null);
    panel.setRoot(root);
    return false;
  });
  const read = jestApi.spyOn(panel.selection, "readDOM");
  try {
    panel.setRoot(root);
    root.querySelector("[data-block-content]")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
    );
    expect(read).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
