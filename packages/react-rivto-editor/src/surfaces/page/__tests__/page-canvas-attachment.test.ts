/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { PageNavigationController } from "../page-navigation-controller";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

it("keeps the latest canvas mount registration across stale cleanup and root remounts", async () => {
  const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const navigation = new PageNavigationController(
    panel.page.adapter,
    panel.page.browserSelection,
    panel.page.virtualization,
  );
  const root = document.createElement("div");
  root.setAttribute("data-rivto-block-editor", "");
  const occurrence = new BrowserInputRoot(root);
  const mountBlocks = jestApi.fn();
  const source = { mountBlocks };
  const first = navigation.attachCanvas(source);
  const second = navigation.attachCanvas(source);
  try {
    navigation.setRoot(occurrence);
    first();
    navigation.mountBlocks(["one"], { scroll: false });
    expect(mountBlocks).toHaveBeenCalledWith(["one"], occurrence);
    navigation.setRoot(null);
    navigation.mountBlocks(["detached"], { scroll: false });
    expect(mountBlocks).toHaveBeenCalledTimes(1);
    navigation.setRoot(occurrence);
    navigation.mountBlocks(["two"], { scroll: false });
    expect(mountBlocks).toHaveBeenLastCalledWith(["two"], occurrence);
    second();
    second();
    navigation.mountBlocks(["after-cleanup"], { scroll: false });
    expect(mountBlocks).toHaveBeenCalledTimes(2);
  } finally {
    navigation.setRoot(null);
    occurrence.detach();
    panel.destroy();
    await panel.editor.destroy();
    await core.destroy();
  }
});
