import { createPortal } from "react-dom";
import { useCanvasViewportLayers } from "./browser/use-canvas-viewport-layers";
import type { CanvasWorldPortalProps } from "./types";

/**
 * Renders content in the current canvas world layer without exposing its element.
 *
 * Content mounts after the viewport attaches and unmounts on detach. A later
 * attachment renders into its own world layer. Server rendering produces no portal.
 *
 * @param props - Content belonging to the current canvas occurrence.
 * @param props.children - React content positioned in world coordinates.
 * @returns The world portal, or null before attachment and during server rendering.
 */
export function CanvasWorldPortal({ children }: CanvasWorldPortalProps) {
  const plane = useCanvasViewportLayers()?.plane;
  return plane ? createPortal(children, plane) : null;
}
