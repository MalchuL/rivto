export interface CanvasPoint { x: number; y: number }

/** Converts a viewport pointer into unscaled canvas coordinates. */
export function canvasPoint(
  point: Pick<PointerEvent, "clientX" | "clientY">,
  viewport: HTMLElement | null,
  fallbackZoom = 1,
): CanvasPoint {
  const rect = viewport?.getBoundingClientRect();
  const zoom = Number(viewport?.dataset.edgelessZoom) || fallbackZoom;
  const panX = Number(viewport?.dataset.edgelessPanX) || 0;
  const panY = Number(viewport?.dataset.edgelessPanY) || 0;
  return rect
    ? { x: (point.clientX - rect.left - panX) / zoom, y: (point.clientY - rect.top - panY) / zoom }
    : { x: 0, y: 0 };
}
