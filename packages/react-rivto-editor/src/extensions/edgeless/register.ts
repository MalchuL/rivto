import type { EditorRuntime } from "../../editor/editor-runtime";
/**
 * Runtime registration for the built-in edgeless surface.
 *
 * The registration applies editor-local card placement options and connects
 * the explicit edgeless surface to shared snapping and placement defaults. Canvas
 * interaction behavior remains in the sibling edgeless extensions.
 *
 * @module
 */
import type { EditorViewApi } from "../../editor-view/types";
import {
  EDGELESS_CARD_DEFAULT_FRAME,
} from "../../elements/block-element-projection";
import {
  type EdgelessSurfaceOptions,
} from "./surface";

const surfaceOptions = new WeakMap<object, EdgelessSurfaceOptions>();

/** @param editor - View or host sharing the surface manager. @returns Configured canvas defaults, or empty options. */
export function getEdgelessSurfaceOptions(editor: EditorViewApi): EdgelessSurfaceOptions {
  return surfaceOptions.get(editor.runtime.surfaces) ?? {};
}

/**
 * Registers the configured positioned-card surface.
 *
 * @param editorRuntime - Runtime receiving the edgeless surface.
 * @param options - Snapping, overlap, and card-width configuration.
 * @returns Cleanup restoring the previous surface defaults.
 */
export function registerEdgelessSurface(
  editorRuntime: EditorRuntime,
  options: EdgelessSurfaceOptions,
): () => void {
  const previous = surfaceOptions.get(editorRuntime.surfaces);
  surfaceOptions.set(editorRuntime.surfaces, options);
  editorRuntime.blockElements.setOverlapAvoidance(options.avoidBlockElementOverlap !== false,
  );
  editorRuntime.blockElements.setDefaultWidth(options.blockElementWidth ?? EDGELESS_CARD_DEFAULT_FRAME.width,
  );
  return () => {
    if (previous) surfaceOptions.set(editorRuntime.surfaces, previous);
    else surfaceOptions.delete(editorRuntime.surfaces);
  };
}
