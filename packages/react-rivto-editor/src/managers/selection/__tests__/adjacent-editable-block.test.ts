/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("returns editable neighbors within a card and stops at contentless blocks", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "";
  root.innerHTML = `
    <div data-edgeless-root="first">
      <div data-block-id="one"><span data-block-content></span></div>
      <div data-block-id="two"><span data-block-content></span></div>
      <div data-block-id="barrier"></div>
      <div data-block-id="three"><span data-block-content></span></div>
    </div>
    <div data-edgeless-root="second">
      <div data-block-id="other"><span data-block-content></span></div>
    </div>`;
  try {
    panel.setRoot(root);
    expect(panel.selection.adjacentEditableBlockId("two", "previous")).toBe("one");
    expect(panel.selection.adjacentEditableBlockId("one", "next")).toBe("two");
    expect(panel.selection.adjacentEditableBlockId("two", "next")).toBeUndefined();
    expect(panel.selection.adjacentEditableBlockId("three", "previous")).toBeUndefined();
    expect(panel.selection.adjacentEditableBlockId("three", "next")).toBeUndefined();
    expect(panel.selection.adjacentEditableBlockId("other", "previous")).toBeUndefined();
    panel.setRoot(null);
    expect(panel.selection.adjacentEditableBlockId("two", "previous")).toBeUndefined();
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

it("mounts an adjacent block at the surface edge and rejects a replaced occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id="first"><span data-block-content></span></div>';
  try {
    panel.setRoot(root);
    const mountedRoot = panel.mountedRoot!;
    const attached = jestApi.spyOn(panel.pageNavigation, "isAttached").mockReturnValue(true);
    const mount = jestApi
      .spyOn(panel.pageNavigation, "mountAdjacentBlocks")
      .mockImplementation(() => {
        root.insertAdjacentHTML(
          "beforeend",
          '<div data-block-id="second"><span data-block-content></span></div>',
        );
      });
    expect(panel.selection.adjacentEditableBlockId("first", "next")).toBe("second");
    expect(mount).toHaveBeenCalledWith("first", 1);
    mount.mockClear();
    root.querySelector('[data-block-id="second"]')!.remove();
    attached.mockImplementation(() => {
      panel.mountedRoot = new BrowserInputRoot(root);
      return true;
    });
    expect(panel.selection.adjacentEditableBlockId("first", "next")).toBeUndefined();
    expect(mount).not.toHaveBeenCalled();
    panel.mountedRoot = mountedRoot;
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

it("keeps special block identities and nested panels within their own occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.innerHTML = `
    <div data-block-id="before"><span data-block-content></span></div>
    <div data-rivto-panel><div data-block-id="child&amp;[1]"><span data-block-content></span></div></div>
    <div data-block-id="child&amp;[1]"><span data-block-content></span></div>`;
  try {
    panel.setRoot(root);
    expect(panel.selection.adjacentEditableBlockId("child&[1]", "previous")).toBe("before");
    expect(panel.selection.adjacentEditableBlockId("before", "next")).toBe("child&[1]");
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
