import type { BrowserInputMap, InputRoot, PointerInput } from "@chulane/rivto-root";
import type { DragHandlePointerOrigin } from "./types";

/**
 * Watches one pointer until its click decision is known or its press ends.
 *
 * Post-release movement with buttons=0 never contributes distance. Reaching the
 * threshold records the decision once and immediately releases the observers.
 *
 * @param root - Occurrence supplying normalized window input for this press.
 * @param origin - Primary pointer identity and viewport origin in CSS pixels.
 * @param threshold - Positive excursion distance in viewport CSS pixels.
 * @param onExceeded - Records that the press reached its click threshold.
 * @param onStop - Releases a standalone handle's owned Root when supplied.
 * @returns Idempotent disposer removing only this press's normalized observers.
 * @throws If listener attachment or cleanup fails.
 */
export function trackHandlePointer(
  root: Pick<InputRoot, "observeWindowInput">,
  origin: DragHandlePointerOrigin,
  threshold: number,
  onExceeded: () => void,
  onStop?: () => void,
): () => void {
  const releases: Array<() => void> = [];
  let stopped = false;
  /**
   * Releases this press's observers without clearing its recorded click decision.
   *
   * @returns Movement, release, cancellation and blur observers are removed.
   * @throws If listener cleanup fails.
   */
  function stop(): void {
    if (stopped) {
      return;
    }
    stopped = true;
    releaseHandleObservers(releases, onStop);
  }
  const observe = (input: PointerInput<"pointermove" | "pointerup" | "pointercancel">) =>
    observeHandlePointer(input, origin, threshold, onExceeded, stop);
  try {
    retainHandleObserver(root, "pointermove", "capture", observe, releases, () => stopped);
    retainHandleObserver(root, "pointerup", "capture", observe, releases, () => stopped);
    retainHandleObserver(root, "pointercancel", "capture", observe, releases, () => stopped);
    retainHandleObserver(root, "blur", "bubble", stop, releases, () => stopped);
  } catch (error) {
    try {
      stop();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Handle pointer setup failed");
    }
    throw error;
  }
  return stop;
}

/**
 * Retains a window observer or releases it after synchronous cancellation.
 *
 * @param root - Occurrence supplying normalized window input.
 * @param type - Input delivered by the occurrence's window.
 * @param phase - Browser propagation phase for this observer.
 * @param observer - Receives normalized input while the press is active.
 * @param releases - Stores cleanup for retained observers.
 * @param isStopped - Checks whether synchronous cancellation ended the press.
 * @returns The observer is retained or immediately released after cancellation.
 * @throws Propagates listener setup or cleanup failures.
 */
function retainHandleObserver<K extends keyof BrowserInputMap>(
  root: Pick<InputRoot, "observeWindowInput">,
  type: K,
  phase: "capture" | "bubble",
  observer: (event: BrowserInputMap[K]) => void,
  releases: Array<() => void>,
  isStopped: () => boolean,
): void {
  if (isStopped()) {
    return;
  }
  const release = root.observeWindowInput(type, phase, observer);
  if (isStopped()) {
    release();
  } else {
    releases.push(release);
  }
}

/**
 * Attempts all window and standalone Root cleanup for a completed press.
 *
 * @param releases - Window observation disposers consumed by this call.
 * @param onStop - Optional cleanup for a standalone owned Root.
 * @returns Every retained cleanup has been attempted.
 * @throws AggregateError when one or more cleanups fail.
 */
function releaseHandleObservers(releases: Array<() => void>, onStop?: () => void): void {
  const errors: unknown[] = [];
  for (const release of [...releases.splice(0), ...(onStop ? [onStop] : [])]) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, "Handle pointer cleanup failed");
  }
}

/**
 * Measures only this pointer's held movement or actual release position.
 *
 * @param input - Normalized pointer lifecycle input; another pointer cannot finish this observation.
 * @param origin - Captured pointer identity and viewport origin in CSS pixels.
 * @param threshold - Positive excursion distance in viewport CSS pixels.
 * @param onExceeded - Records that this press reached its threshold.
 * @param stop - Releases this press's observers without clearing its decision.
 * @returns Excessive excursion is recorded and finished observations are released.
 * @throws If recording the decision or releasing listeners fails.
 */
function observeHandlePointer(
  input: PointerInput<"pointermove" | "pointerup" | "pointercancel">,
  origin: DragHandlePointerOrigin,
  threshold: number,
  onExceeded: () => void,
  stop: () => void,
): void {
  if (input.pointerId !== origin.pointerId) {
    return;
  }
  if (input.type === "pointercancel" || (input.type === "pointermove" && !(input.buttons & 1))) {
    stop();
    return;
  }
  const exceeded =
    Math.hypot(input.clientX - origin.clientX, input.clientY - origin.clientY) >= threshold;
  if (exceeded) {
    onExceeded();
  }
  if (exceeded || input.type === "pointerup") {
    stop();
  }
}
