import { Store } from "../utils/store";
import type { CanvasViewportLayers } from "./types";
import type { CanvasViewport } from "./canvas-viewport";

const attachments = new WeakMap<object, Store<CanvasViewportLayers | null>>();

/**
 * Creates the browser-private attachment state for a viewport owner.
 *
 * @param viewport - Viewport whose lifetime owns the attachment state.
 * @returns Initializes an empty store without reading or attaching the DOM.
 */
export function createCanvasViewportAttachment(viewport: object): void {
  attachments.set(viewport, new Store<CanvasViewportLayers | null>(null));
}

/**
 * Reads the browser-private layer store used by the viewport and its React adapter.
 *
 * @param viewport - Viewport initialized by its constructor.
 * @returns The one attachment store for that viewport.
 * @throws If the viewport was not initialized by its constructor.
 */
export function canvasViewportAttachment(viewport: object): Store<CanvasViewportLayers | null> {
  const attachment = attachments.get(viewport);
  if (!attachment) {
    throw new Error("Canvas viewport attachment is unavailable");
  }
  return attachment;
}

/** Mounted viewport owners used only for browser-side nested input routing. */
export const mountedCanvasViewports = new WeakMap<Element, CanvasViewport>();

/**
 * Finds the nearest mounted canvas owner of a native browser target.
 *
 * @param element - Target or ancestor participating in browser input, or null.
 * @returns Nearest active canvas viewport, or undefined outside an attached canvas.
 */
export function canvasViewportForElement(element: Element | null): CanvasViewport | undefined {
  let current = element;
  while (current) {
    const viewport = mountedCanvasViewports.get(current);
    if (viewport && canvasViewportAttachment(viewport).get()?.coordinates.isAttached()) {
      return viewport;
    }
    current = current.parentElement;
  }
  return undefined;
}
