import type {
  PresetPointerHandlers,
  PresetPointerResources,
  PresetPointerStart,
  PresetViewport,
} from "./types";
import { collectPresetCleanupFailures } from "./preset-drag-cleanup";

/**
 * Acquires button capture and the gesture's normalized pointer observations.
 *
 * If observation setup fails, the acquired capture is released before reporting
 * the failure. A failed release is retained alongside the setup failure.
 *
 * @param viewport - Borrowed viewport input observation.
 * @param input - Pointer-down values and originating button capture operation.
 * @param handlers - Gesture callbacks receiving normalized pointer samples.
 * @param id - Unique prefix for the active gesture's registrations.
 * @returns Capture and observation cleanup operations, or undefined when capture is unavailable.
 * @throws Capture or subscription failures, including a failed rollback.
 */
export function acquirePresetPointer(
  viewport: Pick<PresetViewport, "events">,
  input: PresetPointerStart,
  handlers: PresetPointerHandlers,
  id: string,
): PresetPointerResources | undefined {
  const releaseCapture = input.capture();
  if (!releaseCapture) {
    return undefined;
  }
  try {
    const releaseInput = subscribePresetPointer(viewport, handlers, id);
    return { releaseCapture, releaseInput };
  } catch (error) {
    try {
      releaseCapture();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Preset pointer setup failed");
    }
    throw error;
  }
}

/**
 * Observes pointer movement and completion while a preset gesture is active.
 *
 * Window capture receives the held pointer even outside the toolbar and before
 * descendant handlers can stop propagation. The gesture checks pointer identity.
 *
 * @param viewport - Borrowed viewport input observation.
 * @param handlers - Current gesture callbacks receiving normalized samples.
 * @param id - Unique prefix for the active gesture's registrations.
 * @returns Disposer releasing every observation.
 * @throws If setup fails, or if rollback or observation cleanup fails.
 */
export function subscribePresetPointer(
  viewport: Pick<PresetViewport, "events">,
  handlers: PresetPointerHandlers,
  id: string,
): () => void {
  const releases: Array<() => void> = [];
  try {
    releases.push(
      viewport.events.observe(
        { id: `${id}.move`, type: "pointermove", target: "window", capture: true },
        (input) => handlers.move(input),
      ),
    );
    releases.push(
      viewport.events.observe(
        { id: `${id}.up`, type: "pointerup", target: "window", capture: true },
        (input) => handlers.end(input, true),
      ),
    );
    releases.push(
      viewport.events.observe(
        { id: `${id}.cancel`, type: "pointercancel", target: "window", capture: true },
        (input) => handlers.end(input, false),
      ),
    );
  } catch (error) {
    const failures = collectPresetCleanupFailures(releases);
    if (failures.length) {
      throw new AggregateError([error, ...failures], "Preset pointer setup failed");
    }
    throw error;
  }
  return () => {
    const failures = collectPresetCleanupFailures(releases);
    if (failures.length) {
      throw new AggregateError(failures, "Preset pointer cleanup failed");
    }
  };
}
