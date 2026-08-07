export interface CanvasPoint { x: number; y: number }

/** Converts a viewport pointer into unscaled canvas coordinates. */
export function canvasPoint(
  point: Pick<PointerEvent, "clientX" | "clientY">,
  plane: HTMLElement | null,
  zoom: number,
): CanvasPoint {
  const rect = plane?.getBoundingClientRect();
  return rect
    ? { x: (point.clientX - rect.left) / zoom, y: (point.clientY - rect.top) / zoom }
    : { x: 0, y: 0 };
}
