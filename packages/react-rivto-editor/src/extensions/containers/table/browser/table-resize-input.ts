import type { BrowserInputMap, InputRegion, InputRoot, RegionIdentity } from "@chulane/rivto-root";
import type { TableResizeController } from "../table-resize-controller";

/**
 * Connects one mounted separator to normalized input from its exact panel Root.
 *
 * @param handle - Opaque identity captured at the React mounting boundary.
 * @param controller - Borrowed resize operations for its table cell.
 * @param root - Occurrence that captures the separator and owns input delivery.
 * @param isCurrent - Checks that the panel still exposes this exact Root.
 * @returns Cleanup removing every listener installed for this separator.
 * @throws Propagates capture, listener setup, rollback, and cleanup failures.
 */
export function attachTableResizeInput(
  handle: RegionIdentity,
  controller: Pick<TableResizeController, "start" | "move" | "finish" | "resizeWithKeyboard">,
  root: Pick<InputRoot, "captureRegionByIdentity" | "isAttached">,
  isCurrent: () => boolean,
): () => void {
  let active = true;
  const releases: Array<() => void> = [];
  // Root checks can synchronously replace the panel occurrence.
  const current = () => active && isCurrent() && root.isAttached() && isCurrent() && active;
  try {
    const region = root.captureRegionByIdentity(handle, current);
    if (region && current()) {
      observeTableResize(region, controller, current, releases);
    }
    if (!current()) {
      active = false;
      releaseTableResizeInput(releases);
    }
  } catch (error) {
    active = false;
    try {
      releaseTableResizeInput(releases);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Table resize input setup failed");
    }
    throw error;
  }
  return () => {
    if (active) {
      active = false;
      releaseTableResizeInput(releases);
    }
  };
}

/**
 * Registers pointer and keyboard delivery on a captured separator.
 *
 * @param region - Root-owned separator bounded by the panel occurrence.
 * @param controller - Borrowed resize operations.
 * @param isCurrent - Checks the exact active attachment.
 * @param releases - Receives each installed listener's cleanup.
 * @returns Current listener registrations are retained for cleanup.
 * @throws Propagates registration and immediate cleanup failures.
 */
function observeTableResize(
  region: InputRegion,
  controller: Pick<TableResizeController, "start" | "move" | "finish" | "resizeWithKeyboard">,
  isCurrent: () => boolean,
  releases: Array<() => void>,
): void {
  observe(
    region,
    "pointerdown",
    (event) => controller.start(event, { feedback: region }),
    isCurrent,
    releases,
  );
  observe(region, "pointermove", (event) => controller.move(event), isCurrent, releases);
  observe(region, "pointerup", (event) => controller.finish(event, true), isCurrent, releases);
  observe(region, "pointercancel", (event) => controller.finish(event, false), isCurrent, releases);
  observe(
    region,
    "lostpointercapture",
    (event) => controller.finish(event, false),
    isCurrent,
    releases,
  );
  observe(region, "keydown", (event) => controller.resizeWithKeyboard(event), isCurrent, releases);
}

/**
 * Retains one input observer only while its captured Root remains current.
 *
 * @param region - Captured separator receiving input.
 * @param type - Normalized input name to observe.
 * @param deliver - Controller operation invoked for current input.
 * @param isCurrent - Checks whether the panel still owns the attachment.
 * @param releases - Receives the listener disposer when still current.
 * @returns The listener is retained or immediately released after replacement.
 * @throws Propagates ownership, listener setup, and cleanup failures.
 */
function observe<K extends keyof BrowserInputMap>(
  region: InputRegion,
  type: K,
  deliver: (event: BrowserInputMap[K]) => void,
  isCurrent: () => boolean,
  releases: Array<() => void>,
): void {
  if (!isCurrent()) {
    return;
  }
  const release = region.observeInput(type, "bubble", (event) => {
    if (isCurrent()) {
      deliver(event);
    }
  });
  if (!release) {
    if (isCurrent()) {
      throw new Error("Table resize separator is no longer attached");
    }
    return;
  }
  if (!isCurrent()) {
    release();
  } else {
    releases.push(release);
  }
}

/**
 * Attempts every listener cleanup, retaining failures together.
 *
 * @param releases - Installed listener disposers, consumed by this call.
 * @returns Every retained listener has been offered cleanup.
 * @throws AggregateError when any listener cleanup fails.
 */
function releaseTableResizeInput(releases: Array<() => void>): void {
  const errors: unknown[] = [];
  for (const release of releases.splice(0)) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, "Table resize input cleanup failed");
  }
}
