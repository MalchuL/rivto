import { createContext, useContext, useSyncExternalStore } from "react";
import type { CanvasViewport } from "../browser/canvas-viewport";
import type { CanvasViewportCoordinates } from "../browser/types";
import { canvasViewportAttachment } from "../browser/canvas-viewport-attachment";
import type { CanvasViewportApi } from "./types";

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
 * Observes whether the current canvas occurrence has an attached view.
 *
 * Attachment changes notify sibling components without exposing browser layers.
 * Server rendering and calls outside a viewport provider report false.
 *
 * @returns Whether this occurrence currently has an attached view.
 */
export function useCanvasViewportAttached(): boolean {
  const viewport = useContext(CanvasViewportContext);
  return useSyncExternalStore(
    (listener) => viewport?.subscribeAttachment(listener) ?? (() => {}),
    () => viewport?.isAttached() ?? false,
    () => false,
  );
}

/**
 * Observes the current attachment-bound coordinate capability.
 *
 * A captured capability becomes inactive when its exact attachment is withdrawn,
 * even if a later attachment reuses the same element.
 *
 * @returns Current coordinates capability, or null when unattached or outside a provider.
 */
export function useCanvasViewportCoordinates(): CanvasViewportCoordinates | null {
  const viewport = useContext(CanvasViewportContext);
  return useSyncExternalStore(
    (listener) => (viewport ? canvasViewportAttachment(viewport).subscribe(listener) : () => {}),
    () => (viewport ? (canvasViewportAttachment(viewport).get()?.coordinates ?? null) : null),
    () => null,
  );
}
