import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

/** Local click eligibility; no editor event or native click is consumed. */
interface DragHandleClick {
  /**
   * Starts tracking one primary press and replaces any unfinished local observation.
   *
   * @param event - Handle pointer-down input whose owner window supplies movement.
   * @returns The press origin is captured and temporary window observers are installed.
   */
  onPointerDown(event: ReactPointerEvent<HTMLButtonElement>): void;
  /**
   * Preserves keyboard activation while rejecting a pointer click after excessive travel.
   *
   * @param detail - Native click count; zero identifies keyboard or programmatic activation.
   * @returns Whether the handle may request navigation for this click.
   */
  allowsClick(detail: number): boolean;
}

/**
 * Remembers whether a handle press reached the configured distance from its origin.
 *
 * Returning to the origin does not restore click eligibility. A new primary press
 * resets the decision. Observers exist only during that press and are released on
 * threshold crossing, release, cancellation, window blur or component unmount.
 *
 * @param threshold - Finite positive maximum click excursion in viewport CSS pixels.
 * @returns Local pointer tracking and a navigation eligibility check; no click is cancelled.
 * @throws RangeError when the threshold is not finite and positive.
 */
export function useDragHandleClick(threshold: number): DragHandleClick {
  const exceeded = useRef(false);
  const stop = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => stop.current?.(), []);
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new RangeError("Handle click movement threshold must be finite and positive");
  }
  return {
    /**
     * Captures one primary press without preventing drag activation or native defaults.
     *
     * @param event - Press on the handle; secondary and unrelated pointers are ignored.
     * @returns Previous observation is released and this press starts with click eligibility.
     */
    onPointerDown(event) {
      if (event.button !== 0 || !event.isPrimary) {
        return;
      }
      stop.current?.();
      exceeded.current = false;
      stop.current = trackHandlePointer(
        event.currentTarget.ownerDocument.defaultView!,
        event.nativeEvent,
        threshold,
        exceeded,
      );
    },
    /**
     * Reads this handle's pointer decision without affecting any other control.
     *
     * @param detail - Native click count; keyboard and programmatic clicks use zero.
     * @returns True for keyboard activation or a press that stayed below the threshold.
     */
    allowsClick(detail) {
      return detail === 0 || !exceeded.current;
    },
  };
}

/**
 * Watches one pointer until its click decision is known or its press ends.
 *
 * Post-release movement with buttons=0 never contributes distance. Reaching the
 * threshold records the decision once and immediately releases native observers.
 *
 * @param view - Window belonging to the mounted handle, including iframe occurrences.
 * @param origin - Primary pointer-down event supplying identity and viewport origin.
 * @param threshold - Positive excursion distance in viewport CSS pixels.
 * @param exceeded - Handle-owned flag set once when the excursion reaches the threshold.
 * @returns Idempotent disposer removing only this press's native observers.
 */
function trackHandlePointer(
  view: Window,
  origin: PointerEvent,
  threshold: number,
  exceeded: RefObject<boolean>,
): () => void {
  const { pointerId, clientX: startX, clientY: startY } = origin;
  /**
   * Releases this press's observers without clearing its recorded click decision.
   *
   * @returns Native movement, release, cancellation and blur observers are removed.
   */
  function stop(): void {
    view.removeEventListener("pointermove", observe, true);
    view.removeEventListener("pointerup", observe, true);
    view.removeEventListener("pointercancel", observe, true);
    view.removeEventListener("blur", stop, false);
  }
  /**
   * Measures only this pointer's held movement or actual release position.
   *
   * @param event - Native lifecycle input; another pointer cannot finish this observation.
   * @returns Excessive excursion is recorded and finished observations are released.
   */
  function observe(event: PointerEvent): void {
    if (event.pointerId !== pointerId) {
      return;
    }
    if (event.type === "pointercancel" || (event.type === "pointermove" && !(event.buttons & 1))) {
      stop();
      return;
    }
    exceeded.current ||= Math.hypot(event.clientX - startX, event.clientY - startY) >= threshold;
    if (exceeded.current || event.type === "pointerup") {
      stop();
    }
  }
  view.addEventListener("pointermove", observe, true);
  view.addEventListener("pointerup", observe, true);
  view.addEventListener("pointercancel", observe, true);
  view.addEventListener("blur", stop, false);
  return stop;
}
