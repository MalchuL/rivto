/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { focusCaret } from "../utils/focus-ops";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("publishes a caret without scheduling browser focus when no occurrence is attached", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const schedule = jestApi.spyOn(panel.selection, "scheduleIfSelectionUnchanged");
  try {
    focusCaret(panel, block.id, 1);
    expect(panel.selection.get()?.focusBlockId).toBe(block.id);
    expect(schedule).not.toHaveBeenCalled();
  } finally {
    schedule.mockRestore();
    panel.editor.destroy();
    await core.destroy();
  }
});
