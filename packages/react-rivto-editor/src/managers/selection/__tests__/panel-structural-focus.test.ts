/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("mounts the selected block before Page focuses it and skips detached panels", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const mount = jestApi.spyOn(panel.pageNavigation, "mountBlocks").mockImplementation(() => {});
  const focus = jestApi
    .spyOn(panel.page.browserSelection, "focusBlockSelection")
    .mockReturnValue(true);
  try {
    panel.setRoot(root);
    expect(panel.selection.focusBlockSelection("target")).toBe(true);
    expect(mount).toHaveBeenCalledWith(["target"]);
    expect(focus).toHaveBeenCalledWith("target");
    expect(mount.mock.invocationCallOrder[0]!).toBeLessThan(focus.mock.invocationCallOrder[0]!);
    panel.setRoot(null);
    expect(panel.selection.focusBlockSelection("target")).toBe(false);
    expect(focus).toHaveBeenCalledTimes(1);
  } finally {
    focus.mockRestore();
    mount.mockRestore();
    panel.editor.destroy();
    await core.destroy();
  }
});
