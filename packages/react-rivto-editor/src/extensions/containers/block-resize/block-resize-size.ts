import { isBlockStyle } from "../../../blocks/block-style";
import { MAX_RESIZE_WIDTH, MIN_RESIZE_WIDTH } from "./block-resize-constants";

/**
 * Converts persisted or requested width data to a safe CSS pixel value.
 *
 * @param value - Untrusted block property or caller value.
 * @param placement - Optional placement measured when the value is missing or invalid.
 * @returns Finite width clamped to the supported range, defaulting to 280 pixels when no measurement exists.
 */
export function normalizeResizeWidth(value: unknown, placement?: HTMLElement | null): number {
  const width =
    typeof value === "number" && Number.isFinite(value) ? value : placement?.offsetWidth || 280;
  return Math.max(MIN_RESIZE_WIDTH, Math.min(MAX_RESIZE_WIDTH, width));
}

/**
 * Reads a pixel width from a stored style, using a measured fallback for other units.
 *
 * @param style - Untrusted persisted block style.
 * @param placement - Placement measured when the stored width is absent or uses non-pixel units.
 * @returns Width clamped to the supported placement range.
 */
export function getStyleWidth(style: unknown, placement?: HTMLElement | null): number {
  const width = isBlockStyle(style) ? style.size?.width : undefined;
  const match = typeof width === "string" ? /^(\d+(?:\.\d+)?)(?:px)?$/.exec(width.trim()) : null;
  return normalizeResizeWidth(match ? Number(match[1]) : undefined, placement);
}
