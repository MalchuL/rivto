/** @jest-environment jsdom */
import { act, useEffect, type RefCallback } from "react";
import { jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { Canvas } from "../../core/canvas";
import { CanvasView } from "../canvas-view";
import { useCanvasViewport, useCanvasViewportAttached } from "../canvas-viewport-context";

const onCanvasClick = jest.fn<() => void>();

/**
 * Displays the attachment state of the surrounding canvas viewport.
 *
 * @returns Text showing whether a viewport is currently attached.
 */
function Status() {
  const viewport = useCanvasViewport();
  useEffect(
    () => viewport?.events.register({ id: "test.click", type: "click", handle: onCanvasClick }),
    [viewport],
  );
  return <output>{useCanvasViewportAttached() ? "attached" : "detached"}</output>;
}

it("waits for a host Root and leaves its lifetime with the host", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const canvas = new Canvas();
  const container = document.createElement("div");
  document.body.append(container);
  const renderer = createRoot(container);
  const restoreObserver = mockResizeObserver();
  let element: HTMLElement | null = null;
  let root: BrowserInputRoot | undefined;
  /**
   * Records the view's mounting element for the test-owned Root.
   *
   * @param node - Current viewport element, or null after unmount.
   * @returns The latest mount is available to the fixture.
   */
  const ref = (node: HTMLElement | null) => {
    element = node;
  };
  try {
    renderView(renderer, canvas, ref, null);
    expect(container.textContent).toBe("detached");
    expect(element).not.toBeNull();
    root = new BrowserInputRoot(element!);
    renderView(renderer, canvas, ref, root);
    expect(container.textContent).toBe("attached");
    act(() => element!.click());
    expect(onCanvasClick).toHaveBeenCalledTimes(1);
    root.detach();
    act(() => element!.click());
    expect(onCanvasClick).toHaveBeenCalledTimes(1);
    root = new BrowserInputRoot(element!);
    renderView(renderer, canvas, ref, root);
    act(() => element!.click());
    expect(onCanvasClick).toHaveBeenCalledTimes(2);
    act(() => renderer.unmount());
    expect(root.isAttached()).toBe(true);
  } finally {
    root?.detach();
    onCanvasClick.mockClear();
    restoreObserver();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

/**
 * Renders the viewport with the requested host occurrence.
 *
 * @param renderer - React root owning the fixture.
 * @param canvas - Scene displayed by the viewport.
 * @param ref - Receives the mounted viewport element.
 * @param inputRoot - Host occurrence, or null while awaiting one.
 * @returns The requested view has committed.
 */
function renderView(
  renderer: Root,
  canvas: Canvas,
  ref: RefCallback<HTMLElement>,
  inputRoot: BrowserInputRoot | null,
): void {
  act(() =>
    renderer.render(
      <CanvasView canvas={canvas} viewportRef={ref} inputRoot={inputRoot} interactions={false}>
        <Status />
      </CanvasView>,
    ),
  );
}

/**
 * Supplies the size observer absent from the test browser.
 *
 * @returns Disposer restoring the previous browser constructor.
 */
function mockResizeObserver(): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  const Observer = jest
    .fn()
    .mockImplementation(() => ({ observe: () => {}, disconnect: () => {} }));
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: Observer });
  return () => {
    if (previous) {
      Object.defineProperty(globalThis, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  };
}
