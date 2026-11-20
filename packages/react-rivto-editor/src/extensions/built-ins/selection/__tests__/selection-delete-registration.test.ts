/** @jest-environment ./jest-browser-environment.mjs */
import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { registerSelectionDeletion } from "../selection-deletion";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not restore deleted selection focus after the registration changes", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "selected" });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  element.tabIndex = 0;
  document.body.append(element);
  registerSelectionDeletion(panel.editor);
  let callback: (() => void) | undefined;
  const schedule = jestApi
    .spyOn(panel.selection, "scheduleIfSelectionUnchanged")
    .mockImplementation((next) => {
      callback = next;
      return () => {};
    });
  const get = jestApi.spyOn(panel.selection, "get");
  try {
    panel.setRoot(element);
    const inputRoot = panel.inputRoot!;
    const attached = jestApi.spyOn(inputRoot, "isAttached").mockReturnValue(true);
    element.focus();
    panel.selection.set(createStructuralSelection([block.id]));
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(core.blocks.hasBlock(block.id)).toBe(false);
    expect(callback).toBeDefined();
    panel.setEnabled(false);
    panel.setEnabled(true);
    get.mockClear();
    callback!();
    expect(get).not.toHaveBeenCalled();
    attached.mockRestore();
  } finally {
    get.mockRestore();
    schedule.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});
