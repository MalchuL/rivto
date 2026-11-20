import type { CanvasControlMarkers } from "../types/controls";

/**
 * Applies host interaction markers to the canvas-owned control box and handles.
 *
 * Resize values match the direction already assigned by canvas; rotation uses
 * `true`. The returned cleanup removes these host markers before another host
 * or selection is applied.
 *
 * @param box - Library control box whose canvas markers are already installed.
 * @param markers - Host data-attribute names and current box values.
 * @returns Cleanup removing the applied attributes from this box and its handles.
 */
export function applyCanvasControlMarkers(
  box: HTMLElement,
  markers: CanvasControlMarkers,
): () => void {
  const applied: Array<() => void> = [];
  for (const [name, value] of Object.entries(markers.box)) {
    box.setAttribute(name, value);
    applied.push(() => box.removeAttribute(name));
  }
  for (const handle of box.querySelectorAll<HTMLElement>("[data-canvas-resize-handle]")) {
    handle.setAttribute(markers.resizeHandle, handle.dataset.canvasResizeHandle!);
    applied.push(() => handle.removeAttribute(markers.resizeHandle));
  }
  const rotation = box.querySelector<HTMLElement>("[data-canvas-rotation-handle]");
  if (rotation) {
    rotation.setAttribute(markers.rotationHandle, "true");
    applied.push(() => rotation.removeAttribute(markers.rotationHandle));
  }
  return () => {
    for (const remove of applied) {
      remove();
    }
  };
}
