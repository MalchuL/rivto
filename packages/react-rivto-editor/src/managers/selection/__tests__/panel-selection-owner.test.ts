/** @jest-environment ./jest-browser-environment.mjs */
import { createCaretSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { PageNavigationController } from "../../../surfaces/page/page-navigation-controller";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

it("does not use another occurrence's navigation registration for selection", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const blockId = core.blocks.insertBlock({ type: "paragraph", content: "Text" }).id;
  const otherNavigation = new PageNavigationController(
    panel.page.adapter,
    panel.page.browserSelection,
    panel.page.virtualization,
  );
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${blockId}"><span data-block-content>Text</span></div>`;
  document.body.append(root);
  const otherRoot = new BrowserInputRoot(root);
  try {
    panel.setRoot(root);
    const text = root.querySelector("[data-block-content]")!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
    expect(panel.selection.readDOM()).toBeDefined();
    otherNavigation.setRoot(otherRoot);
    expect(panel.selection.readDOM()).toBeUndefined();
    expect(panel.selection.restoreDOM(createCaretSelection(blockId, 1))).toBe(false);
  } finally {
    otherNavigation.setRoot(null);
    otherRoot.detach();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
    document.getSelection()?.removeAllRanges();
  }
});
