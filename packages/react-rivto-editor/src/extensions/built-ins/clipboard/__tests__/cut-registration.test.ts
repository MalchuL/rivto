/** @jest-environment ./jest-browser-environment.mjs */
import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { clipboardExtension } from "../../built-ins";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not restore the cut selection after its registration changes", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({
    editor: core,
    extensions: [clipboardExtension({ defaultBlockType: "paragraph" })],
  });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "cut" });
  core.blocks.insertBlock({ type: "paragraph", content: "remaining" });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  element.tabIndex = 0;
  document.body.append(element);
  let callback: (() => void) | undefined;
  const schedule = jestApi
    .spyOn(panel.selection, "scheduleIfSelectionUnchanged")
    .mockImplementation((next) => {
      callback = next;
      return () => {};
    });
  const restore = jestApi.spyOn(panel.selection, "restoreDOM");
  try {
    panel.setRoot(element);
    const attached = jestApi.spyOn(panel.inputRoot!, "isAttached").mockReturnValue(true);
    element.focus();
    panel.selection.set(createStructuralSelection([block.id]));
    const event = new Event("cut", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => "", setData: () => {} },
    });
    element.dispatchEvent(event);
    expect(core.blocks.hasBlock(block.id)).toBe(false);
    expect(callback).toBeDefined();
    panel.setEnabled(false);
    panel.setEnabled(true);
    restore.mockClear();
    callback!();
    expect(restore).not.toHaveBeenCalled();
    attached.mockRestore();
  } finally {
    restore.mockRestore();
    schedule.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});
