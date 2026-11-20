/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("mounts only missing block shells before retrying focus", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const focus = jestApi
    .spyOn(panel.page.browserSelection, "focusBlock")
    .mockReturnValueOnce("unmounted")
    .mockReturnValueOnce("focus-requested")
    .mockReturnValueOnce("no-content");
  const mount = jestApi.spyOn(panel.pageNavigation, "mountBlocks").mockImplementation(() => {});
  try {
    panel.setRoot(root);
    expect(panel.selection.focusBlock("missing", 3)).toBe(true);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledWith(["missing"]);
    expect(focus).toHaveBeenCalledWith({ blockId: "missing", offset: 3 });
    expect(panel.selection.focusBlock("contentless", 0)).toBe(false);
    expect(mount).toHaveBeenCalledTimes(1);
    panel.setRoot(null);
    expect(panel.selection.focusBlock("missing", 3)).toBe(false);
    expect(focus).toHaveBeenCalledTimes(3);
  } finally {
    focus.mockRestore();
    mount.mockRestore();
    panel.editor.destroy();
    await core.destroy();
  }
});
