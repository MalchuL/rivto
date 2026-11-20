/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ElementRenderProps } from "../../../managers/elements/types";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { RectangleShape } from "../rectangle-shape";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("releases radius capture on Root replacement without committing the gesture", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  document.body.append(surface);
  const view = createRoot(surface);
  const updateProperties = jestApi.fn();
  const props = {
    element: { id: "rectangle", frame: { width: 100, height: 100 }, props: { cornerRadius: 3 } },
    operations: { updateProperties },
    reactPanel: panel,
    zoom: 1,
    selected: true,
    editing: false,
    preview: false,
  } as unknown as ElementRenderProps;
  try {
    panel.setRoot(surface);
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <svg>
            <RectangleShape {...props} fill="none" stroke="none" strokeWidth={1} />
          </svg>
        </TestPanel>,
      ),
    );
    const handle = surface.querySelector<SVGCircleElement>(
      '[aria-label="Rectangle corner radius"]',
    )!;
    const capture = jestApi.fn();
    const release = jestApi.fn();
    Object.defineProperties(handle, {
      focus: { value: jestApi.fn() },
      setPointerCapture: { value: capture },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: release },
    });
    const down = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
    Object.defineProperty(down, "pointerId", { value: 7 });
    act(() => handle.dispatchEvent(down));
    expect(capture).toHaveBeenCalledWith(7);
    act(() => {
      panel.setRoot(null);
      panel.setRoot(surface);
    });
    expect(release).toHaveBeenCalledWith(7);
    const up = new MouseEvent("pointerup", { bubbles: true });
    Object.defineProperty(up, "pointerId", { value: 7 });
    act(() => handle.dispatchEvent(up));
    expect(updateProperties).not.toHaveBeenCalled();
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
