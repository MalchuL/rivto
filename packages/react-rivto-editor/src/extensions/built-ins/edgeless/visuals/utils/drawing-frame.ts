import type { VisualFrame } from "../types";

/** Pads a freehand path AABB so non-scaling strokes are not clipped at the SVG edge. */
export function padDrawingFrame(
  points: ReadonlyArray<{ x: number; y: number }>,
  strokeWidth: number,
  zoom = 1,
): { frame: VisualFrame; points: Array<{ x: number; y: number }> } {
  const pad = Math.max(1, strokeWidth / (2 * Math.max(zoom, 0.01)));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const frame = {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(1, Math.max(...xs) - minX) + pad * 2,
    height: Math.max(1, Math.max(...ys) - minY) + pad * 2,
  };
  return {
    frame,
    points: points.map((point) => ({ x: point.x - frame.x, y: point.y - frame.y })),
  };
}
