import type { ToolGestureTools } from "./types";

/**
 * Connects one visual-tool gesture to keyboard cancellation and panel deactivation.
 *
 * @param tools - Panel capabilities borrowed for this gesture subscription.
 * @param cancel - Cancels the current tool gesture.
 * @param isCaptured - Reports whether this gesture currently owns a pointer.
 * @returns Disposer releasing both subscriptions without destroying the panel.
 * @throws If setup or cleanup fails; failed rollback retains both failures.
 */
export function subscribeToolGestureCancellation(
  tools: ToolGestureTools,
  cancel: () => boolean,
  isCaptured: () => boolean,
): () => void {
  const stopKeyboard = tools.reactPanel.keyboard.register(
    {
      id: "edgeless.gesture-cancel",
      keys: ["Escape"],
      mode: "edgeless",
      priority: 40,
      when: isCaptured,
    },
    cancel,
  );
  let stopDeactivate: () => void;
  try {
    stopDeactivate = tools.reactPanel.subscribeDeactivation(cancel);
  } catch (error) {
    try {
      stopKeyboard();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Tool cancellation setup failed");
    }
    throw error;
  }
  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;
    const errors: unknown[] = [];
    for (const stop of [stopKeyboard, stopDeactivate]) {
      try {
        stop();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Tool cancellation cleanup failed");
    }
  };
}
