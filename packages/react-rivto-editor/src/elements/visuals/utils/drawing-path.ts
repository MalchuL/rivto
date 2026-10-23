import type { CanvasPoint } from "./canvas-point";

/**
 * Rounds freehand samples into a continuous SVG path using quadratic midpoint curves.
 *
 * Curves stay within the sampled bounds, retain both endpoints and do not mutate
 * stored samples. Preview, visible ink and hit testing use the same geometry.
 *
 * @param points - Ordered finite points in one coordinate space.
 * @returns Empty text without samples, a move for one point, a line for two points,
 * or a smooth path ending at the final sample for longer strokes.
 */
export function drawingPath(points: readonly CanvasPoint[]): string {
  const first = points[0];
  if (!first) {
    return "";
  }
  const segments = [`M${first.x} ${first.y}`];
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index]!;
    const next = points[index + 1]!;
    segments.push(`Q${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`);
  }
  if (points.length > 1) {
    const last = points[points.length - 1]!;
    segments.push(`L${last.x} ${last.y}`);
  }
  return segments.join(" ");
}
