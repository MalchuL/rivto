import type { KeyInput } from "@chulane/rivto-root";
import type { CanvasEvents } from "./canvas-events";
import type { CanvasModifierObserver } from "./types";

/**
 * Observes modifier changes and blur on the window belonging to a canvas occurrence.
 *
 * Registrations borrow the viewport's event owner and remain valid across its
 * attachment lifecycle. This observer does not claim keyboard input.
 *
 * @param events - Viewport-owned input observation capability.
 * @param id - Identity unique to this mounted control observer.
 * @param onModifiers - Receives current Alt and Shift state, or false values on blur.
 * @returns Idempotent disposer releasing this observer's registrations.
 * @throws If registration, rollback, or cleanup fails.
 */
export function subscribeCanvasControlModifiers(
  events: Pick<CanvasEvents, "observe">,
  id: string,
  onModifiers: CanvasModifierObserver,
): () => void {
  const releases: Array<() => void> = [];
  /**
   * Publishes the copied modifier state from a keyboard delivery.
   *
   * @param input - Normalized key input from the attached window.
   * @returns Current modifier state is delivered to the control owner.
   * @throws Propagates observer failures.
   */
  const onKey = (input: KeyInput): void => onModifiers(input.altKey, input.shiftKey);
  try {
    releases.push(
      events.observe({ id: `${id}.keydown`, type: "keydown", target: "window" }, onKey),
    );
    releases.push(events.observe({ id: `${id}.keyup`, type: "keyup", target: "window" }, onKey));
    releases.push(
      events.observe({ id: `${id}.blur`, type: "blur", target: "window" }, () =>
        onModifiers(false, false),
      ),
    );
  } catch (error) {
    try {
      releaseObservers(releases);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Control modifier setup failed");
    }
    throw error;
  }
  return () => releaseObservers(releases);
}

/**
 * Releases every acquired observation, including when another release fails.
 *
 * @param releases - Owned disposers, consumed in reverse registration order.
 * @returns All observations have been offered cleanup; repeated calls do nothing.
 * @throws AggregateError containing any cleanup failures.
 */
function releaseObservers(releases: Array<() => void>): void {
  const errors: unknown[] = [];
  for (const release of releases.splice(0).reverse()) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, "Control modifier cleanup failed");
  }
}
