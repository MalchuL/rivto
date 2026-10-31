const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest }).jest;
import type { ReactPanelApi } from "../../panels/types";
import { CollaborationManager } from "@chulane/rivto";
import type { DocumentModel } from "@chulane/document-model";
import { publishPresence } from "./publish";

/**
 * Attaches the real publisher to a canvas event target with deterministic geometry.
 *
 * @param interval - Pointer timer interval in milliseconds.
 * @returns Event source, captured outgoing presence, and subscription cleanup.
 */
function fixture(interval: number) {
  const states = new Map();
  const setLocalState = jest.fn((state) => {
    if (state) {
      states.set(1, state);
    } else {
      states.delete(1);
    }
  });
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
    collaboration: { clientId: 1, getStates: () => states, setLocalState },
    subscribe: () => () => undefined,
  };
  const panel = {
    document: { getDocument: () => model },
    editor: { panels: { getActive: () => panel } },
    selection: { subscribe: () => () => undefined },
    subscribeDeactivation: () => () => undefined,
    getRoot: () => root,
  };
  const participant = new CollaborationManager(
    model as unknown as DocumentModel,
  ).registerParticipant({
    id: "human",
    user: { id: "test", name: "Vlad", color: "#7c3aed" },
  });
  setLocalState.mockClear();
  const dispose = publishPresence(
    panel as unknown as ReactPanelApi,
    root as unknown as HTMLElement,
    { participant },
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
      expect.objectContaining({
        participants: [expect.objectContaining({ pointer: { type: "canvas", x: 20, y: 20 } })],
      }),
    );
    f.root.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 170, clientY: 280 }));
    f.dispose();
    jest.advanceTimersByTime(interval + 1);
    expect(f.setLocalState).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
});
