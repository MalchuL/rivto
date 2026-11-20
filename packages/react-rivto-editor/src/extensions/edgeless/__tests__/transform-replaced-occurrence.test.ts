/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import {
  getEdgelessRuntime,
  installEdgelessRuntime,
} from "../../built-ins/selection/edgeless-runtime";
import { EdgelessTransformController } from "../edgeless-transform";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not start a transform for an event from a replaced occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoSurface = "edgeless";
  root.innerHTML =
    '<div data-edgeless-object-kind="rectangle" data-edgeless-object-id="shape"></div>';
  const object = root.firstElementChild!;
  const releaseSelection = installEdgelessRuntime(panel.editor);
  const selection = getEdgelessRuntime(panel);
  const set = jestApi.spyOn(selection, "set");
  const controller = new EdgelessTransformController(panel.editor, null, null);
  let dispose: (() => void) | undefined;
  try {
    panel.setRoot(root);
    panel.events.register({ id: "replace", type: "pointerdown", capture: true }, (event) => {
      expect(event).not.toHaveProperty("root");
      panel.setRoot(null);
      panel.setRoot(root);
      return false;
    });
    dispose = controller.setup(panel);
    object.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    expect(set).not.toHaveBeenCalled();
    expect(root.dataset.transforming).toBeUndefined();
  } finally {
    dispose?.();
    set.mockRestore();
    releaseSelection();
    panel.editor.destroy();
    await core.destroy();
  }
});
