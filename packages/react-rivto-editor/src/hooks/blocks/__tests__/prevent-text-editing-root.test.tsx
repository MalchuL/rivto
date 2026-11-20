/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { usePreventTextEditing } from "../use-prevent-text-editing";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

/**
 * Renders one marked editable inside a parent pointer observer.
 *
 * @param props - Callback recording pointer events that reach the parent.
 * @param props.onParentPointer - Called if propagation reaches the outer control.
 * @returns The editable used by the occurrence-lifetime test.
 */
function Editable({ onParentPointer }: { readonly onParentPointer: () => void }) {
  const attributes = usePreventTextEditing();
  return (
    <div onPointerDown={onParentPointer}>
      <div {...attributes} contentEditable suppressContentEditableWarning>
        hello
      </div>
    </div>
  );
}

/**
 * Creates one synthetic pointer delivery for the browser adapter.
 *
 * @param type - Pointer phase dispatched by the test.
 * @param x - Horizontal coordinate used by the caret fixture.
 * @returns Cancelable pointer event with a stable identity.
 */
function pointer(type: string, x: number): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

/**
 * Restores the document hit-testing method after the fixture completes.
 *
 * @param previous - Original own-property descriptor, if one existed.
 * @returns The fixture's replacement is removed or restored.
 */
function restoreCaretHit(previous: PropertyDescriptor | undefined): void {
  if (previous) {
    Object.defineProperty(document, "caretPositionFromPoint", previous);
  } else {
    Reflect.deleteProperty(document, "caretPositionFromPoint");
  }
}

it("keeps nested selection local and releases tracking when its Root is replaced", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  document.body.append(surface);
  const view = createRoot(surface);
  const onParentPointer = jestApi.fn();
  const set = jestApi.spyOn(document.getSelection()!, "setBaseAndExtent");
  const previousHit = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint");
  try {
    panel.setRoot(surface);
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <Editable onParentPointer={onParentPointer} />
        </TestPanel>,
      ),
    );
    const editable = surface.querySelector<HTMLElement>("[contenteditable]")!;
    Object.defineProperty(editable, "isContentEditable", { value: true });
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: (x: number) => ({ offsetNode: editable.firstChild, offset: x > 5 ? 4 : 1 }),
    });
    const down = pointer("pointerdown", 0);
    act(() => editable.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    expect(onParentPointer).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(pointer("pointermove", 10)));
    expect(set).toHaveBeenLastCalledWith(editable.firstChild, 1, editable.firstChild, 4);
    act(() => {
      panel.setRoot(null);
      panel.setRoot(surface);
    });
    set.mockClear();
    act(() => window.dispatchEvent(pointer("pointermove", 0)));
    expect(set).not.toHaveBeenCalled();
  } finally {
    act(() => view.unmount());
    restoreCaretHit(previousHit);
    set.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
