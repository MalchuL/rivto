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
import type { EdgelessSurfaceOptions } from "../../surfaces/edgeless";
import { registerEdgelessDeletion } from "./edgeless-deletion";
import { EdgelessElementDragSlot } from "./edgeless-drag-handle";
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

/** @returns Pointer drag and resize interactions for edgeless root cards. */
export function edgelessTransformExtension(): ReactEditorExtension {
  return {
    id: "transform.edgeless",
    setup: (reactEditor) => {
      reactEditor.surfaces.registerElementSlot({
        position: "left-top",
        priority: 100,
        component: EdgelessElementDragSlot,
        mode: "edgeless",
        when: ({ element, selected }) => selected && element.type !== "connector",
      });
      return registerEdgelessTransform(reactEditor);
    },
  };
}

/** Options for the complete opt-in edgeless interaction preset. */
export interface EdgelessPresetOptions {
  /** Host-owned edgeless viewport settings. */
  readonly surface?: EdgelessSurfaceOptions;
}

/**
 * Creates the complete edgeless surface and block-interaction preset.
 *
 * Visual objects remain separately optional through `edgelessVisualsExtension`.
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
  ];
}

export * from "./visuals";
