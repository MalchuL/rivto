import { collectCleanupErrors } from "../utils/release-resources";
import type { PointerInput } from "@chulane/rivto-root";
import type { CanvasEvents } from "./canvas-events";
import type { CanvasToolGesture } from "./canvas-tool-gesture";

/** Tool input precedes ordinary viewport interaction within its listener group. */
const TOOL_INPUT_PRIORITY = 1000;

/**
 * Routes normalized viewport input to one tool capture layer.
 *
 * Down and hover are admitted only from the layer. Captured movement and release
 * continue at the viewport root even after the pointer leaves that layer.
 *
 * @param events - Borrowed viewport input registration.
 * @param gesture - Tool and pointer-capture owner.
 * @param selector - Selector identifying the mounted capture layer.
 * @param id - Unique identity prefix for these registrations.
 * @param onCapture - Optional host action after successful capture.
 * @returns Disposer removing all input registrations.
 * @throws Registration failures, including rollback failures, or cleanup failures.
 */
export function subscribeCanvasToolInput(
  events: Pick<CanvasEvents, "register">,
  gesture: CanvasToolGesture,
  selector: string,
  id: string,
  onCapture?: () => void,
): () => void {
  const releases: Array<() => void> = [];
  const inside = (input: PointerInput) => input.target?.hasAncestor(selector) ?? false;
  try {
    releases.push(
      events.register({
        id: `${id}.down`,
        type: "pointerdown",
        priority: TOOL_INPUT_PRIORITY,
        handle: (input) => {
          if (!inside(input) || gesture.isCaptured) {
            return;
          }
          gesture.pointerDown({ ...input, capture: input.captureRootPointer });
          if (gesture.isCaptured) {
            try {
              onCapture?.();
            } catch (error) {
              try {
                gesture.cancel();
              } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], "Tool capture failed");
              }
              throw error;
            }
            return "handled";
          }
        },
      }),
    );
    releases.push(
      events.register({
        id: `${id}.move`,
        type: "pointermove",
        priority: TOOL_INPUT_PRIORITY,
        handle: (input) => {
          if (gesture.isCaptured || inside(input)) {
            gesture.pointerMove(input);
          }
        },
      }),
    );
    releases.push(
      events.register({
        id: `${id}.up`,
        type: "pointerup",
        priority: TOOL_INPUT_PRIORITY,
        handle: (input) => gesture.pointerUp(input),
      }),
    );
    releases.push(
      events.register({
        id: `${id}.cancel`,
        type: "pointercancel",
        priority: TOOL_INPUT_PRIORITY,
        handle: (input) => gesture.pointerCancel(input),
      }),
    );
    releases.push(
      events.register({
        id: `${id}.out`,
        type: "pointerout",
        priority: TOOL_INPUT_PRIORITY,
        handle: (input) => {
          if (inside(input) && !input.relatedTarget?.hasAncestor(selector)) {
            gesture.pointerLeave();
          }
        },
      }),
    );
  } catch (error) {
    const failures = collectCleanupErrors(releases);
    if (failures.length) {
      throw new AggregateError([error, ...failures], "Tool input setup failed");
    }
    throw error;
  }
  return () => {
    const failures = collectCleanupErrors(releases);
    if (failures.length) {
      throw new AggregateError(failures, "Tool input cleanup failed");
    }
  };
}
