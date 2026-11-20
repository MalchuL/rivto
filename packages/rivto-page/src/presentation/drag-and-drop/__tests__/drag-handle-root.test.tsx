/** @jest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockEditorInputRootContext } from "../../components/block-editor/block-editor-context";
import { DragHandle } from "../drag-handle";
import { trackHandlePointer } from "../browser/track-handle-pointer";

it("borrows window observation from the current occurrence and releases it on replacement", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const view = createRoot(host);
  const first = new BrowserInputRoot(host);
  const second = new BrowserInputRoot(host);
  const observe = jest.spyOn(first, "observeWindowInput");
  const remove = jest.spyOn(window, "removeEventListener");
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    act(() =>
      view.render(
        <BlockEditorInputRootContext.Provider value={first}>
          <DragHandle />
        </BlockEditorInputRootContext.Provider>,
      ),
    );
    const handle = host.querySelector("button")!;
    const down = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
    Object.defineProperties(down, { pointerId: { value: 1 }, isPrimary: { value: true } });
    act(() => handle.dispatchEvent(down));
    expect(observe).toHaveBeenCalledTimes(4);
    act(() =>
      view.render(
        <BlockEditorInputRootContext.Provider value={second}>
          <DragHandle />
        </BlockEditorInputRootContext.Provider>,
      ),
    );
    expect(remove.mock.calls.some(([type]) => type === "pointermove")).toBe(true);
    expect(first.isAttached()).toBe(true);
  } finally {
    act(() => view.unmount());
    first.detach();
    second.detach();
    observe.mockRestore();
    remove.mockRestore();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
    host.remove();
  }
});

it("releases earlier Root observations and standalone ownership when setup fails", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = new BrowserInputRoot(host);
  const observe = root.observeWindowInput.bind(root);
  const stopRoot = jest.fn();
  const remove = jest.spyOn(window, "removeEventListener");
  const spy = jest.spyOn(root, "observeWindowInput").mockImplementation((type, phase, listener) => {
    if (type === "pointerup") {
      throw new Error("listener failed");
    }
    return observe(type, phase, listener);
  });
  try {
    expect(() =>
      trackHandlePointer(root, { pointerId: 1, clientX: 0, clientY: 0 }, 4, () => {}, stopRoot),
    ).toThrow("listener failed");
    expect(remove.mock.calls.some(([type]) => type === "pointermove")).toBe(true);
    expect(stopRoot).toHaveBeenCalledTimes(1);
  } finally {
    spy.mockRestore();
    remove.mockRestore();
    root.detach();
    host.remove();
  }
});
