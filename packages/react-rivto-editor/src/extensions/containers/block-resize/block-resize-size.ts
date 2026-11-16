import { MAX_RESIZE_WIDTH, MIN_RESIZE_WIDTH } from "./block-resize-constants";

/**
 * Converts persisted or requested width data to a safe CSS pixel value.
 *
 * @param value - Untrusted block property or caller value.
 * @returns Finite width clamped to the supported placement range; invalid values use 280 pixels.
 */
export function normalizeResizeWidth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(MIN_RESIZE_WIDTH, Math.min(MAX_RESIZE_WIDTH, value))
    : 280;
}
