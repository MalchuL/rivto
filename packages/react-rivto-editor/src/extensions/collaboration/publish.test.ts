const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest }).jest;
import type { ReactPanelApi } from "../../panels/types";
import { publishPresence } from "./publish";

/**
 * Attaches the real publisher to a canvas event target with deterministic geometry.
 *
 * @param interval - Pointer timer interval in milliseconds.
 * @returns Event source, captured outgoing presence, and subscription cleanup.
 */
function fixture(interval: number) {
  const setLocalState = jest.fn();
  const document = Object.assign(new EventTarget(), {
    hasFocus: () => true,
    hidden: false,
    defaultView: new EventTarget(),
  });
  const root = Object.assign(new EventTarget(), {
    ownerDocument: document,
    dataset: { edgelessZoom: "2", edgelessPanX: "10", edgelessPanY: "20" },
    getBoundingClientRect: () => ({ left: 100, top: 200 }),
  });
  const model = {
    collaboration: { setLocalState },
    subscribe: () => () => undefined,
  };
  const panel = {
    document: { getDocument: () => model },
    editor: { panels: { getActive: () => panel } },
    selection: { subscribe: () => () => undefined },
    subscribeDeactivation: () => () => undefined,
    events: { getRoot: () => root },
  };
  const dispose = publishPresence(
    panel as unknown as ReactPanelApi,
    root as unknown as HTMLElement,
    { id: "test", name: "Vlad", color: "#7c3aed" },
    {},
    "edgeless",
    interval,
  );
  return { root, setLocalState, dispose };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test.each([0, 5, 125])("coalesces pointer updates at the configured %i ms interval", (interval) => {
  const f = fixture(interval);
  try {
    f.root.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 130, clientY: 240 }));
    f.root.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 150, clientY: 260 }));
    expect(f.setLocalState).not.toHaveBeenCalled();
    if (interval > 0) {
      jest.advanceTimersByTime(interval - 1);
      expect(f.setLocalState).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
    } else {
      jest.advanceTimersByTime(0);
    }
    expect(f.setLocalState).toHaveBeenCalledTimes(1);
    expect(f.setLocalState).toHaveBeenLastCalledWith(
      expect.objectContaining({ pointer: { type: "canvas", x: 20, y: 20 } }),
    );
    f.root.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 170, clientY: 280 }));
    f.dispose();
    jest.advanceTimersByTime(interval + 1);
    expect(f.setLocalState).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
});
