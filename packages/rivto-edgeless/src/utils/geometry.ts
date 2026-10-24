import type { CanvasElement, Rect } from "../types/canvas";

/**
 * Computes the axis-aligned painted extent of a projected element.
 *
 * @param element - World frame, clockwise rotation and optional explicit painted bounds.
 * @returns Explicit bounds or the rotated frame's enclosing rectangle.
 */
export function elementBounds(element: CanvasElement): Rect {
  if (element.bounds) {
    return element.bounds;
  }
  const radians = (element.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const { x, y, width, height } = element.frame;
  const w = width * cos + height * sin;
  const h = width * sin + height * cos;
  return { x: x + (width - w) / 2, y: y + (height - h) / 2, width: w, height: h };
}

/**
 * Tests inclusive intersection, including zero-width paths at a viewport edge.
 *
 * @param a - First world rectangle.
 * @param b - Second world rectangle.
 * @returns Whether their extents overlap or touch.
 */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}

/**
 * Compares rectangle coordinates without allocating serialized keys.
 *
 * @param a - First rectangle.
 * @param b - Second rectangle.
 * @returns Whether all four coordinates match.
 */
export function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
