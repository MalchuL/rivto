/** @jest-environment ./jest-browser-environment.mjs */
import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../../../../../test-utils";
import { registerKeyboardBlockMove } from "../register";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not restore a moved selection after the input registration changes", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = core.blocks.insertBlock({ type: "paragraph", content: "First" });
  const second = core.blocks.insertBlock({ type: "paragraph", content: "Second" });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  element.tabIndex = 0;
  document.body.append(element);
  registerKeyboardBlockMove(panel.editor);
  let callback: (() => void) | undefined;
  const schedule = jestApi
    .spyOn(panel.selection, "scheduleIfSelectionUnchanged")
    .mockImplementation((next) => {
      callback = next;
      return () => {};
    });
  const focus = jestApi.spyOn(panel.selection, "focusBlockSelection").mockReturnValue(false);
  try {
    panel.setRoot(element);
    const attached = jestApi.spyOn(panel.inputRoot!, "isAttached").mockReturnValue(true);
    element.focus();
    panel.selection.set(createStructuralSelection([second.id]));
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, shiftKey: true, bubbles: true }),
    );
    expect(core.blocks.getRootIds()).toEqual([second.id, first.id]);
    expect(callback).toBeDefined();
    panel.setEnabled(false);
    panel.setEnabled(true);
    focus.mockClear();
    callback!();
    expect(focus).not.toHaveBeenCalled();
    attached.mockRestore();
  } finally {
    focus.mockRestore();
    schedule.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});
