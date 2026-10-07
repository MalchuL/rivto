/**
 * Runtime registration for the built-in edgeless surface.
 *
 * The registration applies editor-local card placement options and connects
 * the explicit edgeless surface to shared snapping and placement defaults. Canvas
 * interaction behavior remains in the sibling edgeless extensions.
 *
 * @module
 */
import {
  type EdgelessSurfaceOptions,
} from "./surface";
import {
  EDGELESS_CARD_DEFAULT_FRAME,
  setBlockElementDefaultWidth,
  setBlockElementOverlapAvoidance,
} from "../../elements/block-element-projection";
import type { ReactEditor } from "../../types";

const surfaceOptions = new WeakMap<object, EdgelessSurfaceOptions>();

/** @param editor - View or host sharing the surface manager. @returns Configured canvas defaults, or empty options. */
export function getEdgelessSurfaceOptions(editor: ReactEditor): EdgelessSurfaceOptions {
  return surfaceOptions.get(editor.surfaces) ?? {};
}

/**
 * Registers the configured positioned-card surface.
 *
 * @param reactEditor - Runtime receiving the edgeless surface.
 * @param options - Snapping, overlap, and card-width configuration.
 * @returns Cleanup restoring the previous surface defaults.
 */
export function registerEdgelessSurface(
  reactEditor: ReactEditor,
  options: EdgelessSurfaceOptions,
): () => void {
  const previous = surfaceOptions.get(reactEditor.surfaces);
  surfaceOptions.set(reactEditor.surfaces, options);
  setBlockElementOverlapAvoidance(
    reactEditor,
    options.avoidBlockElementOverlap !== false,
  );
  setBlockElementDefaultWidth(
    reactEditor,
    options.blockElementWidth ?? EDGELESS_CARD_DEFAULT_FRAME.width,
  );
  return () => {
    if (previous) surfaceOptions.set(reactEditor.surfaces, previous);
    else surfaceOptions.delete(reactEditor.surfaces);
  };
}
