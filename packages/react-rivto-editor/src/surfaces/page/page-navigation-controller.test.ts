/** @jest-environment ./jest-browser-environment.mjs */
import { BlockVirtualizationController } from "@chulane/rivto-page";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { EdgelessCanvasAdapter } from "../edgeless/canvas-adapter";
import { PanelDOM } from "../../managers/events/panel-dom";
import { PageNavigationController } from "./page-navigation-controller";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

test("mounts adjacent model roots, excludes nested panels and releases stale suspensions", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.setAttribute("data-rivto-block-editor", "");
  root.setAttribute("data-rivto-panel", "");
  const nested = document.createElement("div");
  nested.setAttribute("data-rivto-panel", "");
  root.append(nested);
  const controller = new PageNavigationController(panel.page.adapter);
  const mountBlocks = jestApi.fn();
  const findBlock = jestApi.spyOn(PanelDOM.prototype, "findBlock").mockReturnValue(null);
  const view = jestApi
    .spyOn(BlockVirtualizationController, "getForRoot")
    .mockReturnValue({ mountBlocks });
  try {
    const first = panel.blocks.insertBlock({ type: "paragraph" }).id;
    const second = panel.blocks.insertBlock({ type: "paragraph" }).id;
    controller.setRoot(root);
    expect(PageNavigationController.getForElement(root)).toBe(controller);
    expect(PageNavigationController.getForElement(nested)).toBeUndefined();
    controller.mountAdjacentBlocks(first, 1);
    expect(mountBlocks).toHaveBeenLastCalledWith([first, second]);
    controller.mountFirstOrLastBlock(-1);
    expect(mountBlocks).toHaveBeenLastCalledWith([second]);
    expect(controller.selection.getSelectableBlockIds()).toEqual([first, second]);
    root.style.overflowAnchor = "auto";
    const oldRelease = controller.suspendScrollAdjustments();
    const otherRelease = controller.suspendScrollAdjustments();
    oldRelease();
    expect(root.style.overflowAnchor).toBe("none");
    controller.setRoot(null);
    expect(root.style.overflowAnchor).toBe("auto");
    expect(PageNavigationController.getForElement(root)).toBeUndefined();
    controller.setRoot(root);
    const currentRelease = controller.suspendScrollAdjustments();
    otherRelease();
    expect(root.style.overflowAnchor).toBe("none");
    currentRelease();
    currentRelease();
    expect(root.style.overflowAnchor).toBe("auto");
  } finally {
    view.mockRestore();
    findBlock.mockRestore();
    controller.setRoot(null);
    panel.destroy();
    panel.editor.destroy();
    core.destroy();
  }
});

test.each(["rivto-block-row", "rivto-block-row"])("resolves only the own %s row", (className) => {
  const root = document.createElement("div");
  root.innerHTML = `<div><div class="${className}"></div></div><div class="${className}"></div>`;
  expect(new PanelDOM(root).getRow(root)).toBe(root.lastElementChild);
});

test("mounts the next displayed canvas card across an undisplayed separator", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  panel.editor.blockTypes.register({
    definition: { type: "separator-fixture" },
    separatesBlockElements: true,
    render: () => null,
  });
  const first = panel.blocks.insertBlock({ type: "paragraph" }).id;
  panel.blocks.insertBlock({ type: "separator-fixture" });
  const last = panel.blocks.insertBlock({ type: "paragraph" }).id;
  panel.mode.set("edgeless");
  const root = document.createElement("div");
  root.setAttribute("data-rivto-block-editor", "");
  const controller = new PageNavigationController(panel.page.adapter);
  const findBlock = jestApi.spyOn(PanelDOM.prototype, "findBlock").mockReturnValue(null);
  const mount = jestApi
    .spyOn(EdgelessCanvasAdapter, "mountBlocksForElement")
    .mockImplementation(() => {});
  try {
    controller.setRoot(root);
    controller.mountAdjacentBlocks(first, 1);
    expect(mount).toHaveBeenCalledWith(root, [first, last]);
    mount.mockClear();
    controller.mountAdjacentBlocks(last, -1);
    expect(mount).toHaveBeenCalledWith(root, [last, first]);
  } finally {
    mount.mockRestore();
    findBlock.mockRestore();
    controller.setRoot(null);
    panel.editor.destroy();
    core.destroy();
  }
});
