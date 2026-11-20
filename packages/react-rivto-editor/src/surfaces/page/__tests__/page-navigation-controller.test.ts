/** @jest-environment ./jest-browser-environment.mjs */
import {
  BrowserInputRoot,
  getBrowserElementIdentity,
} from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { PageNavigationController } from "../page-navigation-controller";

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
  const controller = new PageNavigationController(
    panel.page.adapter,
    panel.page.browserSelection,
    panel.page.virtualization,
  );
  const mountBlocks = jestApi.fn();
  const occurrence = new BrowserInputRoot(root);
  const attached = jestApi.spyOn(occurrence, "isAttached");
  const scroll = jestApi
    .spyOn(occurrence, "scrollFirstMatchingRegionIntoView")
    .mockImplementation(() => {});
  const releaseView = panel.page.virtualization.register(
    getBrowserElementIdentity(root),
    {
      mountBlocks,
      observeRoot: () => () => {},
    },
  );
  const unbind = panel.page.virtualization.bind(
    getBrowserElementIdentity(root),
    occurrence,
  );
  try {
    const first = panel.blocks.insertBlock({ type: "paragraph" }).id;
    const second = panel.blocks.insertBlock({ type: "paragraph" }).id;
    controller.setRoot(occurrence);
    expect(controller.isAttached()).toBe(true);
    expect(PageNavigationController.getForIdentity(getBrowserElementIdentity(root))).toBe(
      controller,
    );
    expect(
      PageNavigationController.getForIdentity(getBrowserElementIdentity(nested)),
    ).toBeUndefined();
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
    expect(controller.isAttached()).toBe(false);
    expect(root.style.overflowAnchor).toBe("auto");
    expect(
      PageNavigationController.getForIdentity(getBrowserElementIdentity(root)),
    ).toBeUndefined();
    controller.setRoot(occurrence);
    attached.mockReturnValueOnce(false);
    expect(controller.isAttached()).toBe(false);
    expect(controller.isAttached()).toBe(true);
    attached.mockImplementationOnce(() => {
      controller.setRoot(null);
      return true;
    });
    expect(controller.isAttached()).toBe(false);
    controller.setRoot(occurrence);
    const currentRelease = controller.suspendScrollAdjustments();
    otherRelease();
    expect(root.style.overflowAnchor).toBe("none");
    currentRelease();
    currentRelease();
    expect(root.style.overflowAnchor).toBe("auto");
  } finally {
    releaseView();
    unbind();
    scroll.mockRestore();
    attached.mockRestore();
    controller.setRoot(null);
    occurrence.detach();
    panel.destroy();
    panel.editor.destroy();
    core.destroy();
  }
});

test("rejects an old navigation registration after replacement on the same surface", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.setAttribute("data-rivto-block-editor", "");
  const first = new PageNavigationController(
    panel.page.adapter,
    panel.page.browserSelection,
    panel.page.virtualization,
  );
  const second = new PageNavigationController(
    panel.page.adapter,
    panel.page.browserSelection,
    panel.page.virtualization,
  );
  const firstRoot = new BrowserInputRoot(root);
  const secondRoot = new BrowserInputRoot(root);
  try {
    first.setRoot(firstRoot);
    const firstAttachment = first.captureAttachment();
    second.setRoot(secondRoot);
    expect(first.isAttached()).toBe(false);
    expect(firstAttachment()).toBe(false);
    expect(second.isAttached()).toBe(true);
    expect(PageNavigationController.getForIdentity(secondRoot.getElementIdentity())).toBe(second);
    first.setRoot(null);
    expect(second.isAttached()).toBe(true);
  } finally {
    second.setRoot(null);
    firstRoot.detach();
    secondRoot.detach();
    panel.destroy();
    panel.editor.destroy();
    core.destroy();
  }
});

test("releases an old scroll suspension when its setup replaces the Root", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const element = document.createElement("div");
  element.setAttribute("data-rivto-block-editor", "");
  element.style.overflowAnchor = "auto";
  const first = new BrowserInputRoot(element);
  const second = new BrowserInputRoot(element);
  const controller = new PageNavigationController(
    panel.page.adapter,
    panel.page.browserSelection,
    panel.page.virtualization,
  );
  const suspend = first.suspendScrollAnchoring.bind(first);
  const spy = jestApi.spyOn(first, "suspendScrollAnchoring").mockImplementationOnce(() => {
    const release = suspend();
    controller.setRoot(second);
    return release;
  });
  try {
    controller.setRoot(first);
    const staleRelease = controller.suspendScrollAdjustments();
    expect(element.style.overflowAnchor).toBe("auto");
    const currentRelease = controller.suspendScrollAdjustments();
    expect(element.style.overflowAnchor).toBe("none");
    staleRelease();
    expect(element.style.overflowAnchor).toBe("none");
    currentRelease();
    expect(element.style.overflowAnchor).toBe("auto");
    expect(controller.isAttached()).toBe(true);
  } finally {
    spy.mockRestore();
    controller.setRoot(null);
    first.detach();
    second.detach();
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

test("does not publish a stale Root when reading its marker installs a replacement", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const firstElement = document.createElement("div");
  const secondElement = document.createElement("div");
  firstElement.dataset.rivtoBlockEditor = "";
  secondElement.dataset.rivtoBlockEditor = "";
  const first = new BrowserInputRoot(firstElement);
  const second = new BrowserInputRoot(secondElement);
  const controller = new PageNavigationController(
    panel.page.adapter,
    panel.page.browserSelection,
    panel.page.virtualization,
  );
  const spy = jestApi.spyOn(first, "readAttribute").mockImplementationOnce(() => {
    controller.setRoot(second);
    return "";
  });
  try {
    controller.setRoot(first);
    expect(PageNavigationController.getForIdentity(first.getElementIdentity())).toBeUndefined();
    expect(PageNavigationController.getForIdentity(second.getElementIdentity())).toBe(controller);
  } finally {
    spy.mockRestore();
    controller.setRoot(null);
    first.detach();
    second.detach();
    panel.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

test.each(["rivto-block-row", "rivto-block-row"])("resolves only the own %s row", (className) => {
  const root = document.createElement("div");
  root.innerHTML = `<div><div class="${className}"></div></div><div class="${className}"></div>`;
  const occurrence = new BrowserInputRoot(root);
  const children = occurrence
    .captureRegionByIdentity(getBrowserElementIdentity(root))!
    .captureChildren()!;
  try {
    expect(children.get(0)?.matches(`.${className}`)).toBe(false);
    const row = children.get(1);
    expect(row?.matches(`.${className}`)).toBe(true);
    expect(row?.getIdentity()).toBe(getBrowserElementIdentity(root.lastElementChild!));
  } finally {
    occurrence.detach();
  }
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
  const controller = new PageNavigationController(
    panel.page.adapter,
    panel.page.browserSelection,
    panel.page.virtualization,
  );
  const occurrence = new BrowserInputRoot(root);
  const scroll = jestApi
    .spyOn(occurrence, "scrollFirstMatchingRegionIntoView")
    .mockImplementation(() => {});
  const mount = jestApi.fn();
  const detachCanvas = controller.attachCanvas({ mountBlocks: mount });
  try {
    controller.setRoot(occurrence);
    controller.mountAdjacentBlocks(first, 1);
    expect(mount).toHaveBeenCalledWith([first, last], occurrence);
    mount.mockClear();
    controller.mountAdjacentBlocks(last, -1);
    expect(mount).toHaveBeenCalledWith([last, first], occurrence);
  } finally {
    detachCanvas();
    scroll.mockRestore();
    controller.setRoot(null);
    occurrence.detach();
    panel.editor.destroy();
    core.destroy();
  }
});
