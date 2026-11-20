/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { installEdgelessRuntime } from "../../built-ins/selection/edgeless-runtime";
import { registerEdgelessDeletion } from "../edgeless-deletion";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("schedules deletion focus through the owning panel and rejects a replaced registration", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const target = core.blocks.insertBlock({ id: "target", type: "paragraph", content: "Target" });
  core.blocks.insertBlock({ id: "other", type: "paragraph", content: "Other" });
  const root = document.createElement("div");
  const replacement = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  replacement.dataset.rivtoBlockEditor = "true";
  root.tabIndex = 0;
  replacement.tabIndex = 0;
  document.body.append(root, replacement);
  const disposeRuntime = installEdgelessRuntime(panel.editor);
  registerEdgelessDeletion(panel.editor);
  panel.setRoot(root);
  root.focus();
  panel.selection.set({
    type: "selection",
    blocks: [{ id: target.id, start: 0, end: -1 }],
    anchorBlockId: target.id,
    focusBlockId: target.id,
  });
  let callback: (() => void) | undefined;
  const schedule = jestApi
    .spyOn(panel.selection, "scheduleIfSelectionUnchanged")
    .mockImplementation((next) => {
      callback = next;
      return () => {};
    });
  const focus = jestApi.spyOn(root, "focus");
  try {
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(core.blocks.hasBlock(target.id)).toBe(false);
    expect(callback).toBeDefined();
    panel.setRoot(null);
    panel.setRoot(replacement);
    focus.mockClear();
    callback!();
    expect(focus).not.toHaveBeenCalled();
  } finally {
    schedule.mockRestore();
    focus.mockRestore();
    disposeRuntime();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
    replacement.remove();
  }
});
