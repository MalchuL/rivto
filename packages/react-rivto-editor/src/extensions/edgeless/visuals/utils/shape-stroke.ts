import type { VisualFrame } from "../types";

/**
 * ViewBox inset (0–100 space) so non-scaling strokes stay inside the SVG.
 *
 * Stroke width is screen pixels; the SVG CSS box is `frame * zoom`.
 */
export function shapeStrokePad(
  strokeWidth: number,
  frame: VisualFrame,
  zoom = 1,
): { x: number; y: number } {
  const scale = Math.max(zoom, 0.01);
  return {
    x: Math.min(45, Math.max(1, (strokeWidth / 2) * (100 / (Math.max(frame.width, 1) * scale)))),
    y: Math.min(45, Math.max(1, (strokeWidth / 2) * (100 / (Math.max(frame.height, 1) * scale)))),
  };
}
