/**
 * Marks the root DOM node for one mounted React editor.
 *
 * Root-level bridges use this as the boundary for document selection, pointer,
 * and keyboard behavior.
 */
export const RIVTO_EDITOR_ROOT_ATTR = "data-rivto-editor-root";

/**
 * Stores the active surface type on the editor root.
 *
 * This gives CSS, tests, and future overlays a stable way to distinguish block
 * and edgeless rendering without inspecting React component names.
 */
export const RIVTO_SURFACE_ATTR = "data-rivto-surface";
