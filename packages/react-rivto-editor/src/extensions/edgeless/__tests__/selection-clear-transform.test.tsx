/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { EditorRootContext } from "../../../components/editor-panel/editor-root-context";
import { SurfaceContext } from "../../../surfaces/surface";
import { getEdgelessRuntime } from "../../built-ins/selection/edgeless-runtime";
import { edgelessSelectionExtension } from "..";
import { EdgelessInteractionOverlay } from "../edgeless-selection";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("keeps canvas selection during a transform and clears it after the transform ends", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessSelectionExtension()] });
  const root = document.createElement("div");
  root.dataset.rivtoSurface = "edgeless";
  document.body.append(root);
  const view = createRoot(document.createElement("div"));
  const selection = getEdgelessRuntime(panel);
  const get = jestApi.spyOn(selection, "get").mockReturnValue({ active: true, items: ["card"] });
  const clear = jestApi.spyOn(selection, "clear");
  try {
    panel.setRoot(root);
    act(() => {
      view.render(
        <TestPanel panel={panel}>
          <EditorRootContext.Provider
            value={{ identity: getBrowserElementIdentity(root), ref: panel.setRoot }}
          >
            <SurfaceContext.Provider value="edgeless">
              <EdgelessInteractionOverlay />
            </SurfaceContext.Provider>
          </EditorRootContext.Provider>
        </TestPanel>,
      );
    });
    root.dataset.transforming = "move";
    act(() => root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(clear).not.toHaveBeenCalled();
    delete root.dataset.transforming;
    act(() => root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(clear).toHaveBeenCalledTimes(1);
  } finally {
    act(() => view.unmount());
    get.mockRestore();
    clear.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
