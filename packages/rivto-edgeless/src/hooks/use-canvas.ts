import { useSyncExternalStore } from "react";
import type { Canvas } from "../core/canvas";
import type { Camera, CanvasElement } from "../types/canvas";

/**
 * Subscribes only to camera changes.
 *
 * @param canvas - State owner.
 * @returns Stable camera snapshot until its coordinates change.
 */
export function useCanvasCamera(canvas: Pick<Canvas, "camera">): Camera {
  return useSyncExternalStore(canvas.camera.subscribe, canvas.camera.get, canvas.camera.get);
}
/**
 * Subscribes only to mounted membership changes.
 *
 * @param canvas - State owner.
 * @returns Stable ordered visible ID array.
 */
export function useCanvasVisible(canvas: Pick<Canvas, "visible">): readonly string[] {
  return useSyncExternalStore(canvas.visible.subscribe, canvas.visible.get, canvas.visible.get);
}
/**
 * Subscribes to one element's source or preview geometry.
 *
 * @param canvas - State owner.
 * @param id - Stable element ID.
 * @returns Current projection or undefined when missing.
 */
export function useCanvasElement(
  canvas: Pick<Canvas, "elementStore">,
  id: string,
): CanvasElement | undefined {
  const store = canvas.elementStore(id);
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
