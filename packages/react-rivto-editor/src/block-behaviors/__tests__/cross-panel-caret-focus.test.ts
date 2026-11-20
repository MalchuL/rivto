/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { focusCaret, scheduleBlockFocus } from "../utils/focus-ops";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("rejects an active input registration owned by another panel", async () => {
  const core = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: core });
  const second = createTestReactEditor({ editor: core });
  const set = jestApi.spyOn(first.selection, "set");
  const schedule = jestApi.spyOn(first.selection, "scheduleIfSelectionUnchanged");
  try {
    first.setRoot(document.createElement("div"));
    second.setRoot(document.createElement("div"));
    const other = second.inputRoot!;
    expect(other.isAttached()).toBe(true);
    focusCaret(first, "block", 0, other);
    scheduleBlockFocus(first, "block", 0, other);
    expect(set).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  } finally {
    set.mockRestore();
    schedule.mockRestore();
    first.editor.destroy();
    second.editor.destroy();
    await core.destroy();
  }
});
