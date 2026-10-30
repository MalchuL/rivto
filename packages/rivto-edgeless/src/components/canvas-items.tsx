import { memo } from "react";
import type { Canvas } from "../core/canvas";
import type { CanvasItemRenderer } from "../types/canvas-view";
import { useCanvasElement, useCanvasVisible } from "../hooks/use-canvas";

/** Element observation and renderer for a single mounted geometry host. */
interface CanvasItemProps {
  readonly canvas: Pick<Canvas, "elementStore">;
  readonly id: string;
  readonly render: CanvasItemRenderer;
}

/** Visible membership and element snapshots borrowed by the item collection. */
export interface CanvasItemsProps {
  readonly canvas: Pick<Canvas, "visible" | "elementStore">;
  readonly renderElement: CanvasItemRenderer;
}

/**
 * Isolates one renderer from unrelated element and camera updates.
 *
 * @param props - State owner, element ID and stable consumer renderer.
 * @returns Consumer content for the current projection, or nothing after removal.
 */
const CanvasItem = memo(function CanvasItem({ canvas, id, render }: CanvasItemProps) {
  const element = useCanvasElement(canvas, id);
  if (!element) {
    return null;
  }
  return render(element);
});

/**
 * Mounts only visible or pinned elements without subscribing their content to the camera.
 *
 * @param props - State owner and consumer rendering callback.
 * @param props.canvas - Canvas supplying ordered visible membership.
 * @param props.renderElement - Renders one projected element, including its positioning host.
 * @returns Keyed visible items.
 */
export const CanvasItems = memo(function CanvasItems({ canvas, renderElement }: CanvasItemsProps) {
  const ids = useCanvasVisible(canvas);
  return ids.map((id) => <CanvasItem key={id} canvas={canvas} id={id} render={renderElement} />);
});
