/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CanvasMarquee } from "@chulane/rivto-edgeless";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { SurfaceContext } from "../../../surfaces/surface";
import { EditorRootContext } from "../../../components/editor-panel/editor-root-context";
import { EdgelessInteractionOverlay } from "../edgeless-selection";
import { edgelessSelectionExtension } from "..";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

/**
 * Dispatches a primary pointer press through the mounted surface.
 *
 * @param surface - Current occurrence receiving the press.
 * @returns React has processed the pointer delivery.
 */
function press(surface: HTMLElement): void {
  act(() => {
    surface.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, buttons: 1 }));
  });
}

it("reinstalls marquee input for a replacement Root on the same surface", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessSelectionExtension()] });
  const surface = document.createElement("div");
  surface.dataset.rivtoSurface = "edgeless";
  document.body.append(surface);
  const view = createRoot(document.createElement("div"));
  const start = jestApi.spyOn(CanvasMarquee.prototype, "start");
  try {
    panel.setRoot(surface);
    act(() =>
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
      ),
    );
    press(surface);
    expect(start).toHaveBeenCalledTimes(1);
    const original = panel.inputRoot;
    act(() => {
      panel.setRoot(null);
      panel.setRoot(surface);
    });
    expect(panel.inputRoot).not.toBe(original);
    press(surface);
    expect(start).toHaveBeenCalledTimes(2);
  } finally {
    act(() => view.unmount());
    start.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
