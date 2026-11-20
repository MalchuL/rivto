import type { InputRootOwnerCheck } from "./types";

/** Tracks capture identity when an element is remounted during a pointer gesture. */
const pointerCaptures = new WeakMap<Element, Map<number, object>>();

/**
 * Captures a pointer on the attached target and retains its exact release identity.
 *
 * A release remains usable after detachment, but cannot release a newer capture
 * acquired through this function for the same target and pointer.
 *
 * @param target - Mounted input target receiving the capture.
 * @param pointerId - Browser identity of the pointer being delivered.
 * @param isAttached - Checks whether the original listener is still attached.
 * @returns Idempotent release, or undefined after detachment.
 * @throws If the browser rejects pointer capture or release.
 */
export function capturePointer(
  target: Element,
  pointerId: number,
  isAttached: InputRootOwnerCheck,
): (() => void) | undefined {
  if (!isAttached()) {
    return undefined;
  }
  target.setPointerCapture(pointerId);
  let captures = pointerCaptures.get(target);
  if (!captures) {
    captures = new Map();
    pointerCaptures.set(target, captures);
  }
  const identity = {};
  captures.set(pointerId, identity);
  return () => {
    if (captures.get(pointerId) !== identity) {
      return;
    }
    captures.delete(pointerId);
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
  };
}
