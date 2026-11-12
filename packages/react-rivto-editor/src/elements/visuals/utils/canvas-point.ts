import type { CanvasApi } from "@chulane/rivto-edgeless";
export interface CanvasPoint {
  x: number;
  y: number;
}

/**
 * Converts client coordinates to canvas coordinates using the current camera.
 *
 * @param point - Browser pointer position in client pixels.
 * @param viewport - Receiving viewport, or null before it mounts.
 * @param canvas - Surface-owned scene supplying the current camera transform.
 * @returns Canvas coordinates, or the origin when the viewport is unavailable.
 */
export function canvasPoint(
  point: Pick<PointerEvent, "clientX" | "clientY">,
  viewport: HTMLElement | null,
  canvas: Pick<CanvasApi, "toWorld">,
): CanvasPoint {
  const rect = viewport?.getBoundingClientRect();
  if (!rect) {
    return { x: 0, y: 0 };
  }
  return canvas.toWorld({ x: point.clientX - rect.left, y: point.clientY - rect.top });
}
