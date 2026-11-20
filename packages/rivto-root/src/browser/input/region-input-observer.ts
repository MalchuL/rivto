import type { BrowserInputMap } from "../../events/types";
import { captureBrowserInput } from "./capture-browser-input";

/**
 * Installs one normalized browser listener on a captured occurrence region.
 *
 * The actual occurrence remains the normalization root. Region and attachment
 * ownership are checked before and after input capture. Target hit capture is
 * limited to the synchronous callback, matching the shared input adapter.
 *
 * @param root - Owning occurrence used for input normalization.
 * @param element - Region receiving the native listener.
 * @param isOwned - Checks the captured region and occurrence lifetime.
 * @param type - Browser input name to observe.
 * @param phase - Capture or bubble phase on the region.
 * @param observer - Receives normalized input during its synchronous delivery.
 * @returns Idempotent disposer, or undefined if ownership has ended.
 * @throws Propagates listener setup, normalization, observer, and cleanup failures.
 */
export function observeRegionInput<K extends keyof BrowserInputMap>(
  root: HTMLElement,
  element: Element,
  isOwned: () => boolean,
  type: K,
  phase: "capture" | "bubble",
  observer: (input: BrowserInputMap[K]) => void,
): (() => void) | undefined {
  if (!isOwned()) {
    return undefined;
  }
  let active = true;
  const current = () => active && isOwned();
  const listener = (event: Event) => {
    if (!current()) {
      return;
    }
    let delivering = true;
    try {
      const input = captureBrowserInput(event, root, current, () => delivering);
      if (current()) {
        // This listener is installed for the same event-map key used by the observer.
        observer(input as BrowserInputMap[K]);
      }
    } finally {
      delivering = false;
    }
  };
  const capture = phase === "capture";
  try {
    element.addEventListener(type, listener, { capture, passive: false });
    if (!current()) {
      active = false;
      element.removeEventListener(type, listener, capture);
      return undefined;
    }
  } catch (error) {
    active = false;
    try {
      element.removeEventListener(type, listener, capture);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Region input setup and rollback failed");
    }
    throw error;
  }
  return () => {
    if (active) {
      active = false;
      element.removeEventListener(type, listener, capture);
    }
  };
}
