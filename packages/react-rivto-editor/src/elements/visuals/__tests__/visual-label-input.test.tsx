/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { useReactPanelContext } from "../../../hooks/editor/use-react-panel-context";
import { createVisualLabelInput } from "../browser/visual-label-input";
import type { EditableLabelFocusPoint } from "../../../components";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

/**
 * Renders a visual host with Root-bound label activation.
 *
 * @param props - Editing availability and the callback recording input coordinates.
 * @param props.enabled - Whether the label accepts double-clicks.
 * @param props.start - Records a viewport point for a permitted double-click.
 * @returns A mounted visual host.
 */
function Visual({
  enabled,
  start,
}: {
  enabled: boolean;
  start: (point: EditableLabelFocusPoint) => void;
}) {
  const { reactPanel } = useReactPanelContext();
  const onDoubleClick = createVisualLabelInput(reactPanel, enabled, start);
  return (
    <div onDoubleClick={onDoubleClick} data-visual="">
      <button type="button" onDoubleClick={(event) => event.stopPropagation()}>
        Nested control
      </button>
    </div>
  );
}

it("reconnects label input after Root replacement and stops when disabled", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  document.body.append(surface);
  const view = createRoot(surface);
  const start = jestApi.fn();
  /**
   * Renders the same visual with the requested label availability.
   *
   * @param enabled - Whether the visual accepts label editing.
   * @returns The fixture reflects the requested availability.
   */
  function render(enabled: boolean): void {
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <Visual enabled={enabled} start={start} />
        </TestPanel>,
      ),
    );
  }
  try {
    panel.setRoot(surface);
    render(true);
    const host = surface.querySelector<HTMLElement>("[data-visual]")!;
    const nested = host.querySelector("button")!;
    act(() => nested.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(start).not.toHaveBeenCalled();
    act(() =>
      host.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 11, clientY: 12 })),
    );
    expect(start).toHaveBeenLastCalledWith({ x: 11, y: 12 });
    act(() => panel.setRoot(null));
    act(() => host.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(start).toHaveBeenCalledTimes(1);
    act(() => panel.setRoot(surface));
    act(() =>
      host.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 21, clientY: 22 })),
    );
    expect(start).toHaveBeenLastCalledWith({ x: 21, y: 22 });
    render(false);
    act(() => host.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(start).toHaveBeenCalledTimes(2);
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
