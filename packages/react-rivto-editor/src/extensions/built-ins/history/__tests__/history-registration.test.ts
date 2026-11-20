/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { registerHistory } from "../history";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not restore history focus after the input registration changes", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  document.body.append(element);
  registerHistory(panel.editor);
  let callback: (() => void) | undefined;
  const schedule = jestApi
    .spyOn(panel.selection, "scheduleIfSelectionUnchanged")
    .mockImplementation((next) => {
      callback = next;
      return () => {};
    });
  const restore = jestApi.spyOn(panel.selection, "restoreDOM").mockReturnValue(false);
  try {
    panel.setRoot(element);
    const inputRoot = panel.inputRoot!;
    const attached = jestApi.spyOn(inputRoot, "isAttached").mockReturnValue(true);
    element.dispatchEvent(
      new InputEvent("beforeinput", { inputType: "historyUndo", bubbles: true }),
    );
    expect(callback).toBeDefined();
    panel.setEnabled(false);
    panel.setEnabled(true);
    restore.mockClear();
    callback!();
    expect(restore).not.toHaveBeenCalled();
    attached.mockRestore();
  } finally {
    schedule.mockRestore();
    restore.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});
