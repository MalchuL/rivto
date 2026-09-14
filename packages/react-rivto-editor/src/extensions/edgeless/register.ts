/**
 * Runtime registration for the built-in edgeless surface.
 *
 * The registration applies editor-local card placement options and connects
 * the shared edgeless surface component to the React surface manager. Canvas
 * interaction behavior remains in the sibling edgeless extensions.
 *
 * @module
 */
import { createElement } from "react";
import {
  EdgelessSnappingStore,
  EdgelessSurface,
  type EdgelessSurfaceOptions,
} from "./surface";
import {
  EDGELESS_CARD_DEFAULT_FRAME,
  setBlockElementDefaultWidth,
  setBlockElementOverlapAvoidance,
} from "../../elements/block-element-projection";
import type { ReactEditor } from "../../types";

/**
 * Registers the configured positioned-card surface.
 *
 * @param reactEditor - Runtime receiving the edgeless surface.
 * @param options - Snapping, overlap, and card-width configuration.
 * @returns No value.
 */
export function registerEdgelessSurface(
  reactEditor: ReactEditor,
  options: EdgelessSurfaceOptions,
): void {
  const snapping = options.snapping ?? new EdgelessSnappingStore();
  setBlockElementOverlapAvoidance(
    reactEditor,
    options.avoidBlockElementOverlap !== false,
  );
  setBlockElementDefaultWidth(
    reactEditor,
    options.blockElementWidth ?? EDGELESS_CARD_DEFAULT_FRAME.width,
  );
  reactEditor.surfaces.register("edgeless", () => createElement(EdgelessSurface, {
    snapping,
    avoidBlockElementOverlap: options.avoidBlockElementOverlap !== false,
    blockElementWidth: options.blockElementWidth,
  }));
}
