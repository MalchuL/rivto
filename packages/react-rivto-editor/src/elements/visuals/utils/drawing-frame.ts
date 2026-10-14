import type { EditorElementNode } from "@chulane/rivto";
import type { DrawingVisual, VisualFrame } from "../types";

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

/**
 * Scales drawing points to match a changed frame, retaining pressure and stroke style.
 * SVG preview already stretches the path; saving scaled points keeps that appearance
 * when the renderer updates its viewBox to the committed frame size.
 * @param element - Current element whose points use its current frame coordinates.
 * @param frame - New frame dimensions; omitted dimensions retain their current values.
 * @returns A points patch, or an empty patch for other types and unchanged dimensions.
 */
export function drawingResizeProps(
  element: Pick<EditorElementNode, "type" | "frame" | "props">,
  frame: Partial<VisualFrame>,
): { points?: DrawingVisual["points"] } {
  if (element.type !== "drawing" || !Array.isArray(element.props.points)) {
    return {};
  }
  const width = frame.width ?? element.frame.width;
  const height = frame.height ?? element.frame.height;
  if (width === element.frame.width && height === element.frame.height) {
    return {};
  }
  const scaleX = width / element.frame.width;
  const scaleY = height / element.frame.height;
  return {
    points: (element.props.points as DrawingVisual["points"]).map((point) => ({
      ...point,
      x: point.x * scaleX,
      y: point.y * scaleY,
    })),
  };
}
