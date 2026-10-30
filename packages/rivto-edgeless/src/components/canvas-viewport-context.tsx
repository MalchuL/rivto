import { createContext, useContext, useSyncExternalStore } from "react";
import type { CanvasViewport, CanvasViewportLayers } from "../browser/canvas-viewport";

/** Borrowed browser state and registrations; DOM attachment belongs to CanvasView. */
export interface CanvasViewportApi {
  readonly canvas: CanvasViewport["canvas"];
  readonly layers: CanvasViewport["layers"];
  readonly events: Pick<CanvasViewport["events"], "register">;
}

/** Shared browser attachment; kept separate from the framework-neutral editor class. */
export const CanvasViewportContext = createContext<CanvasViewport | null>(null);

/**
 * Reads the browser attachment owner without subscribing to camera or pointer samples.
 *
 * @returns Shared viewport, or null outside an editor provider or standalone CanvasView.
 */
export function useCanvasViewport(): CanvasViewportApi | null {
  return useContext(CanvasViewportContext);
}

/**
 * Observes mount and unmount of the receiving view's DOM layers.
 *
 * Sibling extensions inside CanvasEditorProvider observe the same attachment as
 * children of CanvasView. Camera and geometry updates do not replace this snapshot.
 *
 * @returns Mounted root and world plane, or null before mount, after detach and during SSR.
 */
export function useCanvasViewportLayers(): CanvasViewportLayers | null {
  const viewport = useCanvasViewport();
  return useSyncExternalStore(
    (listener) => viewport?.layers.subscribe(listener) ?? (() => {}),
    () => viewport?.layers.get() ?? null,
    () => null,
  );
}
