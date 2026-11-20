import type { ScrollAnchoringState } from "./types";

const suspensions = new WeakMap<HTMLElement, ScrollAnchoringState>();

/**
 * Suppresses browser scroll anchoring while one or more callers hold a suspension.
 *
 * Cleanup restores the original inline value after the final owner,
 * even when the initiating occurrence has detached or its element was reused.
 *
 * @param element - Mounted occurrence whose inline style is temporarily changed.
 * @param isCurrent - Checks whether the initiating occurrence remains attached.
 * @returns Idempotent cleanup, or a no-op if the occurrence is no longer current.
 * @throws Propagates ownership and style failures; failed setup is rolled back.
 */
export function suspendScrollAnchoring(element: HTMLElement, isCurrent: () => boolean): () => void {
  if (!isCurrent()) {
    return () => {};
  }
  let state = suspensions.get(element);
  if (!state) {
    state = {
      value: element.style.overflowAnchor,
      count: 0,
    };
    suspensions.set(element, state);
  }
  const captured = state;
  captured.count += 1;
  let active = true;
  /**
   * Releases this suspension and restores the original style for the final owner.
   *
   * @returns This owner no longer suppresses browser scroll anchoring.
   * @throws Propagates browser style restoration failures.
   */
  const release = () => {
    if (!active) {
      return;
    }
    active = false;
    captured.count -= 1;
    if (captured.count === 0) {
      suspensions.delete(element);
      element.style.overflowAnchor = captured.value;
    }
  };
  try {
    if (isCurrent()) {
      element.style.overflowAnchor = "none";
    }
    if (!isCurrent()) {
      release();
    }
  } catch (error) {
    try {
      release();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Scroll anchoring setup failed");
    }
    throw error;
  }
  return release;
}
