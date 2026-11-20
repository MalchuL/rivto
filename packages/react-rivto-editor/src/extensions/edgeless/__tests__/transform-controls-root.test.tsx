/** @jest-environment ./jest-browser-environment.mjs */
import { act, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { edgelessSelectionExtension } from "..";
import { EdgelessTransformController } from "../edgeless-transform";
import { EdgelessTransformControls } from "../edgeless-transform-controls";

it("updates controls when the panel registration changes without a surface remount", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessSelectionExtension()] });
  const controller = new EdgelessTransformController(panel.editor, null, null);
  const surface = document.createElement("div");
  const container = document.createElement("div");
  document.body.append(surface, container);
  const view = createRoot(container);
  let renders = 0;
  try {
    panel.setRoot(surface);
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <Profiler
            id="controls"
            onRender={() => {
              renders++;
            }}
          >
            <EdgelessTransformControls controller={controller} />
          </Profiler>
        </TestPanel>,
      ),
    );
    const registration = panel.inputRegistration;
    const initialRenders = renders;
    act(() => panel.setEnabled(false));
    expect(registration?.isCurrent()).toBe(false);
    expect(renders).toBeGreaterThan(initialRenders);
    const disabledRenders = renders;
    act(() => panel.setEnabled(true));
    expect(panel.inputRoot).toBeDefined();
    expect(panel.inputRegistration).not.toBe(registration);
    expect(renders).toBeGreaterThan(disabledRenders);
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
