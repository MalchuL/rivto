import type { CanvasPointerInput } from "@chulane/rivto-edgeless/browser";
import type { CanvasViewportCoordinates } from "@chulane/rivto-edgeless/react";
import type { EdgelessToolPointer } from "../../../../managers/edgeless-tools/edgeless-tool";
import type { ToolViewport } from "./types";

/**
 * Converts browser pointer input into the tool's canvas-space contract.
 *
 * @param event - Detached viewport coordinates and pointer/modifier metadata.
 * @param viewport - Borrowed live snapping policy, or null when unavailable.
 * @param coordinates - Attachment-bound client-to-world conversion, or null when unavailable.
 * @param zoom - Canvas scale used for screen-constant snapping distance.
 * @returns Detached normalized input, or undefined when the captured attachment is unavailable.
 */
export function toolPointer(
  event: CanvasPointerInput,
  viewport: ToolViewport | null,
  coordinates: Pick<CanvasViewportCoordinates, "clientToWorld"> | null,
  zoom: number,
): EdgelessToolPointer | undefined {
  const point = coordinates?.clientToWorld({ x: event.clientX, y: event.clientY });
  if (!point || !viewport) {
    return undefined;
  }
  const snapping = viewport.canvas.snapping.get();
  return {
    point,
    pointerId: event.pointerId,
    button: event.button,
    shiftKey: event.shiftKey,
    zoom,
    snapping: {
      snapToGrid: snapping.snap,
      alignObjects: snapping.align,
      grid: snapping.grid || undefined,
      threshold: 8 / Math.max(zoom, 0.01),
      disabled: event.altKey,
    },
  };
}
