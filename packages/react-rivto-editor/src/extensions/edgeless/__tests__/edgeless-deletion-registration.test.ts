/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { installEdgelessRuntime } from "../../built-ins/selection/edgeless-runtime";
import { registerEdgelessDeletion } from "../edgeless-deletion";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not restore canvas focus after the input registration changes", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const target = core.blocks.insertBlock({ type: "paragraph", content: "Target" });
  core.blocks.insertBlock({ type: "paragraph", content: "Other" });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  element.tabIndex = 0;
  document.body.append(element);
  const dispose = installEdgelessRuntime(panel.editor);
  registerEdgelessDeletion(panel.editor);
  let callback: (() => void) | undefined;
  const schedule = jestApi
    .spyOn(panel.selection, "scheduleIfSelectionUnchanged")
    .mockImplementation((next) => {
      callback = next;
      return () => {};
    });
  const focus = jestApi.spyOn(element, "focus");
  try {
    panel.setRoot(element);
    const attached = jestApi.spyOn(panel.inputRoot!, "isAttached").mockReturnValue(true);
    element.focus();
    panel.selection.set({
      type: "selection",
      blocks: [{ id: target.id, start: 0, end: -1 }],
      anchorBlockId: target.id,
      focusBlockId: target.id,
    });
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(core.blocks.hasBlock(target.id)).toBe(false);
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
    dispose();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});
