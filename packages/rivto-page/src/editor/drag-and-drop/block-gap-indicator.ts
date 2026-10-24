import type { BlockDropIndicator } from "./types";

/**
 * Computes one shared line between two stationary placement bounds.
 *
 * Grid neighbors on different rows use a horizontal line; inline order follows
 * actual rectangles, including RTL. Callers exclude retained source placeholders
 * before deciding whether the two anchors are visually adjacent.
 *
 * @param previous - Full preceding placement rectangle in viewport CSS pixels.
 * @param next - Full following placement rectangle in viewport CSS pixels.
 * @param axis - Actual child flow, independently of nesting permission.
 * @returns Two-pixel indicator centered between the adjacent bounds.
 */
export function blockGapIndicator(
  previous: DOMRect,
  next: DOMRect,
  axis: "vertical" | "horizontal" | "grid",
): BlockDropIndicator {
  const inline =
    axis === "horizontal" ||
    (axis === "grid" && Math.max(previous.top, next.top) < Math.min(previous.bottom, next.bottom));
  if (inline) {
    return {
      left:
        (previous.left > next.left ? previous.left + next.right : previous.right + next.left) / 2 -
        1,
      top: Math.min(previous.top, next.top),
      width: 2,
      height: Math.max(previous.bottom, next.bottom) - Math.min(previous.top, next.top),
    };
  }
  return {
    left: next.left,
    top: (previous.bottom + next.top) / 2 - 1,
    width: next.width,
    height: 2,
  };
}
