/** @jest-environment ./jest-browser-environment.mjs */
import { Canvas } from "@chulane/rivto-edgeless";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessSurfaceController } from "../edgeless-surface-controller";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
const snap = { snapToGrid: false, alignObjects: false };

it("restores pan markers and ignores callbacks from a replaced occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const canvas = new Canvas();
  const controller = new EdgelessSurfaceController(panel, canvas, false, 400);
  const element = document.createElement("div");
  element.dataset.panning = "previous";
  element.dataset.edgelessPanTool = "true";
  const first = new BrowserInputRoot(element);
  const releaseFirst = controller.attachPanRoot(first);
  const old = controller.getViewportProps(canvas.camera.get(), snap, first);
  try {
    expect(old.panEnabled()).toBe(true);
    old.onPanState(true, true);
    expect(element.dataset.panningReady).toBe("true");
    expect(element.dataset.panning).toBe("true");
    first.detach();
    releaseFirst();
    expect(element.dataset.panning).toBe("previous");
    const second = new BrowserInputRoot(element);
    const releaseSecond = controller.attachPanRoot(second);
    const current = controller.getViewportProps(canvas.camera.get(), snap, second);
    try {
      current.onPanState(true, true);
      old.onPanState(false, false);
      releaseFirst();
      expect(old.panEnabled()).toBe(false);
      expect(element.dataset.panning).toBe("true");
      current.onPanState(false, false);
      expect(element.dataset.panning).toBe("previous");
      expect(element.dataset.panningReady).toBeUndefined();
    } finally {
      releaseSecond();
      second.detach();
    }
  } finally {
    releaseFirst();
    first.detach();
    canvas.dispose();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("rolls back the first marker when installing the second fails", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const canvas = new Canvas();
  const controller = new EdgelessSurfaceController(panel, canvas, false, 400);
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const set = root.setTemporaryAttribute.bind(root);
  const spy = jestApi.spyOn(root, "setTemporaryAttribute").mockImplementation((name, value) => {
    if (name === "data-panning") {
      throw new Error("marker failed");
    }
    return set(name, value);
  });
  const release = controller.attachPanRoot(root);
  try {
    const callbacks = controller.getViewportProps(canvas.camera.get(), snap, root);
    expect(() => callbacks.onPanState(true, true)).toThrow("marker failed");
    expect(element.hasAttribute("data-panning-ready")).toBe(false);
  } finally {
    release();
    spy.mockRestore();
    root.detach();
    canvas.dispose();
    panel.editor.destroy();
    await core.destroy();
  }
});
