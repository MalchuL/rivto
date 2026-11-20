import { useContext, useSyncExternalStore } from "react";
import { canvasViewportAttachment } from "../../browser/canvas-viewport-attachment";
import type { CanvasViewportLayers } from "../../browser/types";
import { CanvasViewportContext } from "../canvas-viewport-context";

/**
 * Observes mount and unmount of the receiving view's DOM layers.
 *
 * Sibling extensions inside CanvasEditorProvider observe the same attachment as
 * children of CanvasView. Camera and geometry updates do not replace this snapshot.
 *
 * @returns Mounted root and world plane, or null before mount, after detach and during SSR.
 */
export function useCanvasViewportLayers(): CanvasViewportLayers | null {
  const viewport = useContext(CanvasViewportContext);
  return useSyncExternalStore(
    (listener) => (viewport ? canvasViewportAttachment(viewport).subscribe(listener) : () => {}),
    () => (viewport ? canvasViewportAttachment(viewport).get() : null),
    () => null,
  );
}
