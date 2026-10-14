import type { ReactEditorApi } from "../../editor/types";
/**
 * Runtime registration for the built-in edgeless surface.
 *
 * The registration applies editor-local card placement options and connects
 * the explicit edgeless surface to shared snapping and placement defaults. Canvas
 * interaction behavior remains in the optional edgeless extensions.
 *
 * @module
 */
import type { ReactPanelApi } from "../../panels/types";
import { EDGELESS_CARD_DEFAULT_FRAME } from "../../elements/block-element-projection";
import { type EdgelessSurfaceOptions } from ".";

const surfaceOptions = new WeakMap<object, EdgelessSurfaceOptions>();

/** @param editor - View or host sharing the surface manager. @returns Configured canvas defaults, or empty options. */
export function getEdgelessSurfaceOptions(editor: ReactPanelApi): EdgelessSurfaceOptions {
  return surfaceOptions.get(editor.editor.surfaces) ?? {};
}

/**
 * Registers the configured positioned-card surface.
 *
 * @param reactEditor - Runtime receiving the edgeless surface.
 * @param options - Snapping, overlap, and card-width configuration.
 * @returns Cleanup restoring the previous surface defaults.
 */
export function registerEdgelessSurface(
  reactEditor: ReactEditorApi,
  options: EdgelessSurfaceOptions,
): () => void {
  const previous = surfaceOptions.get(reactEditor.surfaces);
  surfaceOptions.set(reactEditor.surfaces, options);
  reactEditor.blockElements.setOverlapAvoidance(options.avoidBlockElementOverlap !== false);
  reactEditor.blockElements.setDefaultWidth(
    options.blockElementWidth ?? EDGELESS_CARD_DEFAULT_FRAME.width,
  );
  return () => {
    if (previous) {
      surfaceOptions.set(reactEditor.surfaces, previous);
    } else {
      surfaceOptions.delete(reactEditor.surfaces);
    }
  };
}
