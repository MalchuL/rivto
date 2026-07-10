/**
 * Marks the DOM element that owns one mounted Rivto editor view.
 *
 * View plugins use this root as their event boundary for document-level UI
 * behavior such as drag and drop, overlays, keyboard handling, and menus.
 */
export const RIVTO_EDITOR_ROOT_ATTR = "data-rivto-editor-root";

/**
 * Stores the active surface type on the editor root element.
 *
 * Plugins can read this attribute when DOM events do not already carry React
 * props, for example during native drag/drop or pointer event delegation.
 */
export const RIVTO_SURFACE_ATTR = "data-rivto-surface";
