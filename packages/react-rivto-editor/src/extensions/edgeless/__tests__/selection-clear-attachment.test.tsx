/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { SurfaceContext } from "../../../surfaces/surface";
import { getEdgelessRuntime } from "../../built-ins/selection/edgeless-runtime";
import { EdgelessInteractionOverlay } from "../edgeless-selection";
import { edgelessSelectionExtension } from "..";
import { EditorRootContext } from "../../../components/editor-panel/editor-root-context";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not clear or focus a replacement occurrence for an earlier Escape", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessSelectionExtension()] });
  const surface = document.createElement("div");
  surface.dataset.rivtoSurface = "edgeless";
  document.body.append(surface);
  const view = createRoot(document.createElement("div"));
  const selection = getEdgelessRuntime(panel);
  const get = jestApi.spyOn(selection, "get").mockReturnValue({ active: true, items: ["card"] });
  const clear = jestApi.spyOn(selection, "clear");
  const focus = jestApi.spyOn(surface, "focus");
  try {
    panel.setRoot(surface);
    act(() => {
      view.render(
        <TestPanel panel={panel}>
          <EditorRootContext.Provider
            value={{ identity: getBrowserElementIdentity(surface), ref: panel.setRoot }}
          >
            <SurfaceContext.Provider value="edgeless">
              <EdgelessInteractionOverlay />
            </SurfaceContext.Provider>
          </EditorRootContext.Provider>
        </TestPanel>,
      );
    });
    panel.editor.keyboard.register({ id: "replace-root", keys: "Escape", priority: 100 }, () => {
      panel.setRoot(null);
      panel.setRoot(surface);
      return false;
    });
    act(() =>
      surface.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(clear).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  } finally {
    act(() => view.unmount());
    get.mockRestore();
    clear.mockRestore();
    focus.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
