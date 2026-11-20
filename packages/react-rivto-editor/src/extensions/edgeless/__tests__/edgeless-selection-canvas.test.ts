/** @jest-environment ./jest-browser-environment.mjs */
import { Canvas } from "@chulane/rivto-edgeless";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessSelectionRuntime } from "../../built-ins/selection/edgeless-runtime";
import { EdgelessSelectionController } from "../edgeless-selection-controller";
import { createEdgelessMarquee } from "../browser/create-edgeless-marquee";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

it("uses the supplied occurrence canvas for marquee geometry without a mounted viewport", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const selection = new EdgelessSelectionRuntime(panel);
  const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
  const setSelection = jestApi.spyOn(selection, "set");
  const canvas = new Canvas();
  canvas.setElements([
    {
      id: "only-this-canvas",
      frame: { x: 10, y: 10, width: 20, height: 20 },
      rotation: 0,
      zIndex: 0,
    },
  ]);
  const inputRoot = new BrowserInputRoot(root);
  const controller = new EdgelessSelectionController(
    createEdgelessMarquee(inputRoot, panel.elements, selection, canvas),
    inputRoot,
    selection,
    { isCurrent: () => true },
  );
  try {
    controller.marquee.start(0, 0, []);
    expect(controller.marquee.move(40, 40)).toBe(true);
    expect(setSelection).toHaveBeenCalledWith(["only-this-canvas"]);
  } finally {
    controller.destroy();
    inputRoot.detach();
    canvas.dispose();
    await panel.editor.destroy();
    await core.destroy();
  }
});
