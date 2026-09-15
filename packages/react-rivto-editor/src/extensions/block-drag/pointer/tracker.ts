/** Raw viewport pointer tracking and auto-scroll filtering for page drag gestures. */
import type { PointerCoordinates, PointerTracker } from "../types";

const EDGELESS_CARD_CONTENT_SELECTOR = "[data-edgeless-card-content]";

/**
 * Keeps dnd-kit auto-scroll off canvas cards and inert modal backgrounds.
 *
 * @param element - Candidate auto-scroll ancestor.
 * @returns Whether dnd-kit may scroll the element.
 */
export function canPageDragAutoScroll(element: Element): boolean {
  const modal = element.ownerDocument.querySelector("dialog:modal");
  return (!modal || modal.contains(element))
    && !(element instanceof HTMLElement && element.matches(EDGELESS_CARD_CONTENT_SELECTOR));
}

/**
 * Follows the untranslated viewport pointer position for one gesture.
 *
 * @param activatorEvent - Native event that started the gesture.
 * @returns A tracker for pointer gestures, or null for keyboard activation.
 */
export function trackGesturePointer(activatorEvent: Event): PointerTracker | null {
  const activator = activatorEvent as Event & { clientX?: unknown; clientY?: unknown };
  const target = activatorEvent.target;
  const ownerDocument = target instanceof Node ? target.ownerDocument : null;
  if (typeof activator.clientX !== "number" || typeof activator.clientY !== "number" || !ownerDocument) {
    return null;
  }
  let current: PointerCoordinates = { x: activator.clientX, y: activator.clientY };
  const update = (event: PointerEvent) => {
    current = { x: event.clientX, y: event.clientY };
  };
  ownerDocument.addEventListener("pointermove", update, { capture: true, passive: true });
  return {
    get: () => current,
    dispose: () => ownerDocument.removeEventListener("pointermove", update, { capture: true }),
  };
}
