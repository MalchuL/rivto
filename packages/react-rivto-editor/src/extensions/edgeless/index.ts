import { edgelessVisualsExtension } from "./visuals/extension";
import type { EdgelessVisualsOptions } from "./visuals/types";
/**
 * Optional edgeless surface and interaction extension catalog.
 *
 * Edgeless behavior lives outside the standard page preset so hosts opt into
 * canvas rendering and interactions explicitly. These extensions may consume
 * built-in selection and clipboard foundations; built-ins never depend back on
 * this folder.
 *
 * @module
 */
import type { ReactEditorExtension } from "../../managers";
import type { EdgelessSurfaceOptions } from "./surface";
import { registerEdgelessDeletion } from "./edgeless-deletion";
import { registerEdgelessMovement } from "./edgeless-movement";
import { installEdgelessRuntime } from "../built-ins/selection/edgeless-runtime";
import { EdgelessInteractionOverlay } from "./edgeless-selection";
import { registerEdgelessTransform } from "./edgeless-transform";
import { registerEdgelessSurface } from "./register";

/** @returns The built-in positioned-card surface. */
export function edgelessSurfaceExtension(
  options: EdgelessSurfaceOptions = {},
): ReactEditorExtension {
  return {
    id: "surface.edgeless",
    setup: (reactEditor) => registerEdgelessSurface(reactEditor, options),
  };
}

/** @returns Root-card click, toggle, and rectangle selection in edgeless mode. */
export function edgelessSelectionExtension(): ReactEditorExtension {
  return {
    id: "selection.edgeless",
    setup: (reactEditor) => {
      const disposeRuntime = installEdgelessRuntime(reactEditor);
      reactEditor.extensions.mount(EdgelessInteractionOverlay);
      return disposeRuntime;
    },
  };
}

/** @returns Atomic Backspace/Delete removal of selected canvas blocks. */
export function edgelessDeletionExtension(): ReactEditorExtension {
  return { id: "selection.edgeless-delete", setup: registerEdgelessDeletion };
}

/** @returns One- or ten-pixel keyboard movement of selected canvas roots. */
export function edgelessMovementExtension(): ReactEditorExtension {
  return { id: "movement.edgeless", setup: registerEdgelessMovement };
}

/**
 * Installs Moveable dragging, snapping, resize, and rotation for selected HTML elements.
 * Handles are mounted per view; the editor retains selection, connector previews, and undo.
 * @returns The optional edgeless transform extension.
 */
export function edgelessTransformExtension(): ReactEditorExtension {
  return {
    id: "transform.edgeless",
    setup: (reactEditor) => registerEdgelessTransform(reactEditor),
  };
}

/** Options for the complete opt-in edgeless interaction preset. */
export interface EdgelessPresetOptions {
  /** Built-in figures and standard creation/property UI; toolbar can be disabled here. */
  readonly visuals?: EdgelessVisualsOptions;
  /** Host-owned edgeless viewport settings. */
  readonly surface?: EdgelessSurfaceOptions;
}

/**
 * Creates the complete edgeless surface and block-interaction preset.
 *
 * Visual objects and their standard UI are installed by this preset. Individual
 * interaction extensions remain available for hosts composing a custom editor.
 *
 * @param options - Optional surface configuration.
 * @returns Edgeless extensions in their required registration order.
 */
export function edgelessPreset(options: EdgelessPresetOptions = {}): readonly ReactEditorExtension[] {
  return [
    edgelessSurfaceExtension(options.surface),
    edgelessSelectionExtension(),
    edgelessTransformExtension(),
    edgelessDeletionExtension(),
    edgelessMovementExtension(),
    edgelessVisualsExtension(options.visuals),
  ];
}

export * from "./visuals";

export { useEdgelessElementStyle } from "./use-edgeless-element-style";
