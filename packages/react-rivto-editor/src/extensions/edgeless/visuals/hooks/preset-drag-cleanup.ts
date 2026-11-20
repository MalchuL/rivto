import type { PresetDrag } from "./types";

/**
 * Discards a toolbar gesture and attempts all preview and capture cleanup.
 *
 * @param active - Gesture owning the preview and pointer capture.
 * @param clearPreview - Removes the React preview portal.
 * @param clearGuides - Removes the displayed snapping guides.
 * @returns The tool, preview, input observations, capture and guides have all been offered cleanup.
 * @throws AggregateError containing any cleanup failures.
 */
export function cancelPresetDrag(
  active: PresetDrag,
  clearPreview: () => void,
  clearGuides: () => void,
): void {
  const errors = collectPresetCleanupFailures([
    () => clearPresetGhost(active, clearPreview),
    () => active.tool.cancel(),
    () => active.releaseInput(),
    () => active.releaseCapture(),
    clearGuides,
  ]);
  if (errors.length) {
    throw new AggregateError(errors, "Preset drag cancellation failed");
  }
}

/**
 * Releases toolbar gesture resources before the caller decides whether to commit.
 *
 * A failed release also cancels the tool so the caller cannot commit a partial
 * gesture. Every cleanup is attempted before the failure is reported.
 *
 * @param active - Gesture owning the preview and pointer capture.
 * @param clearPreview - Removes the React preview portal.
 * @param clearGuides - Removes the displayed snapping guides.
 * @returns Preview, input observations, capture and guides have been released without committing.
 * @throws AggregateError containing release and any subsequent cancellation failures.
 */
export function releasePresetDrag(
  active: PresetDrag,
  clearPreview: () => void,
  clearGuides: () => void,
): void {
  const errors = collectPresetCleanupFailures([
    () => clearPresetGhost(active, clearPreview),
    () => active.releaseInput(),
    () => active.releaseCapture(),
    clearGuides,
  ]);
  if (errors.length) {
    errors.push(...collectPresetCleanupFailures([() => active.tool.cancel()]));
    throw new AggregateError(errors, "Preset drag release failed");
  }
}

/**
 * Removes the detached preview and cancels its pending animation frame.
 *
 * @param active - Gesture whose preview host is owned by the toolbar.
 * @param clearPreview - Removes the React preview portal.
 * @returns Clears the portal and host without modifying document data.
 * @throws AggregateError after attempting every preview cleanup if any fail.
 */
function clearPresetGhost(active: PresetDrag, clearPreview: () => void): void {
  const cancelFrame = active.cancelFrame;
  const preview = active.preview;
  active.preview = null;
  active.cancelFrame = undefined;
  const errors = collectPresetCleanupFailures([
    () => cancelFrame?.(),
    () => preview?.remove(),
    clearPreview,
  ]);
  if (errors.length) {
    throw new AggregateError(errors, "Preset preview cleanup failed");
  }
}

/**
 * Attempts every cleanup without discarding earlier failures.
 *
 * @param releases - Operations to attempt in invocation order.
 * @returns Failures in the order they were encountered.
 */
export function collectPresetCleanupFailures(releases: readonly (() => void)[]): unknown[] {
  const errors: unknown[] = [];
  for (const release of releases) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}
