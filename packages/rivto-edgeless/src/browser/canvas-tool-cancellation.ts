import type { CanvasEvents } from "./canvas-events";
import type { CanvasToolSession } from "../types/tool-session";

/**
 * Subscribes one tool gesture to Escape and its attached window's blur.
 *
 * Separate observation groups preserve delivery after the viewport's input
 * handlers and cannot be claimed by them. Root observation includes nested
 * occurrences, matching the previous unfiltered browser listener.
 *
 * @param events - Borrowed occurrence event observation without attachment ownership.
 * @param tools - Session that restores the fallback when no gesture is captured.
 * @param cancel - Cancels a captured gesture and reports whether one was active.
 * @returns Disposer releasing both observations; it does not destroy the session.
 * @throws If registration fails, or if rollback or cleanup fails.
 */
export function subscribeCanvasToolCancellation(
  events: Pick<CanvasEvents, "observe">,
  tools: Pick<CanvasToolSession, "reset">,
  cancel: () => boolean,
): () => void {
  const releaseKey = events.observe(
    { id: "canvas.tool.escape", type: "keydown", includeNested: true },
    (event) => {
      if (event.key === "Escape") {
        if (!cancel()) {
          tools.reset();
        }
        event.preventDefault();
      }
    },
  );
  let releaseBlur: () => void;
  try {
    releaseBlur = events.observe(
      { id: "canvas.tool.blur", type: "blur", target: "window", includeNested: true },
      () => cancel(),
    );
  } catch (error) {
    try {
      releaseKey();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Tool cancellation setup failed");
    }
    throw error;
  }
  return () => {
    const errors: unknown[] = [];
    for (const release of [releaseKey, releaseBlur]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Tool cancellation cleanup failed");
    }
  };
}
