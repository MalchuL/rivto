/** @jest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CanvasToolbarLayoutView } from "../canvas-toolbar-layout";
import { CanvasViewportContext } from "../canvas-viewport-context";
import { CanvasViewport } from "../../browser/canvas-viewport";
import { Canvas } from "../../core/canvas";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("dismisses only unprevented Escape and eligible outside pointer input", () => {
  const container = document.createElement("div");
  const outside = document.createElement("button");
  document.body.append(container, outside);
  const view = createRoot(container);
  const setMenu = jestApi.fn();
  const reset = jestApi.fn();
  const tools = { active: { keepsMenuOpen: false }, reset };
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    act(() =>
      view.render(
        <CanvasToolbarLayoutView
          entries={<button>Inside</button>}
          content={null}
          menu="shapes"
          popoverId="shapes"
          setMenu={setMenu}
          tools={tools}
        />,
      ),
    );
    const inside = container.querySelector("button")!;
    act(() => inside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(setMenu).not.toHaveBeenCalled();
    const prevent = (event: Event) => event.preventDefault();
    inside.addEventListener("keydown", prevent);
    act(() =>
      inside.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );
    expect(reset).not.toHaveBeenCalled();
    expect(setMenu).not.toHaveBeenCalled();
    inside.removeEventListener("keydown", prevent);
    act(() =>
      inside.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );
    expect(reset).toHaveBeenCalledTimes(1);
    expect(setMenu).toHaveBeenCalledWith(null);
    setMenu.mockClear();
    act(() => outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(setMenu).toHaveBeenCalledWith(null);
    setMenu.mockClear();
    tools.active.keepsMenuOpen = true;
    act(() => outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(setMenu).not.toHaveBeenCalled();
    act(() => view.unmount());
    act(() =>
      outside.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(reset).toHaveBeenCalledTimes(1);
  } finally {
    act(() => view.unmount());
    container.remove();
    outside.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("borrows its canvas Root and observes document-bubble input", () => {
  const surface = document.createElement("div");
  const plane = document.createElement("div");
  const container = document.createElement("div");
  surface.append(plane, container);
  document.body.append(surface);
  const occurrence = new BrowserInputRoot(surface);
  const viewport = new CanvasViewport(new Canvas());
  const detach = viewport.attach(surface, plane, occurrence);
  const observe = jestApi.spyOn(occurrence, "observeDocumentInput");
  const view = createRoot(container);
  const reset = jestApi.fn();
  const setMenu = jestApi.fn();
  const stop = (event: Event) => event.stopPropagation();
  document.addEventListener("keydown", stop);
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    act(() =>
      view.render(
        <CanvasViewportContext.Provider value={viewport}>
          <CanvasToolbarLayoutView
            entries={<button>Inside</button>}
            content={null}
            menu="shapes"
            popoverId="shapes"
            setMenu={setMenu}
            tools={{ reset }}
          />
        </CanvasViewportContext.Provider>,
      ),
    );
    expect(observe).toHaveBeenCalledTimes(2);
    const target = container.querySelector("button")!;
    act(() => target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(setMenu).toHaveBeenCalledWith(null);
    act(() => view.unmount());
    expect(occurrence.isAttached()).toBe(true);
  } finally {
    act(() => view.unmount());
    document.removeEventListener("keydown", stop);
    observe.mockRestore();
    detach();
    occurrence.detach();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
