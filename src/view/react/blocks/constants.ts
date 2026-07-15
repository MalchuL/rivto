/**
 * Generic block wrapper class used by surfaces and tests.
 *
 * Block renderers should not depend on this class. It belongs to the React view
 * shell that owns selection, handles, drag wiring, and children placement.
 */
export const RIVTO_BLOCK_SHELL_CLASS = "rv-block";

/** Drag handle class shared by block mode and edgeless block shells. */
export const RIVTO_BLOCK_HANDLE_CLASS = "rv-block-handle";

/** DOM attribute used by edgeless local-drag code to find positioned blocks. */
export const RIVTO_DRAG_ID_ATTR = "data-rivto-drag-id";

/** Positioned block class for edgeless DOM-canvas blocks. */
export const RIVTO_CANVAS_BLOCK_CLASS = "rv-canvas-block";

/** Selector for positioned edgeless blocks. */
export const RIVTO_CANVAS_BLOCK_SELECTOR = `.${RIVTO_CANVAS_BLOCK_CLASS}`;
