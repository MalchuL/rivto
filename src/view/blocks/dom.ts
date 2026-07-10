/**
 * Marks the DOM element that represents one rendered block.
 *
 * View plugins use this marker to resolve native DOM events back to document
 * block IDs, for example during drag/drop, selection overlays, and block menus.
 */
export const RIVTO_BLOCK_ATTR = "data-rivto-block-id";

/**
 * Marks a rendered block as selected by local editor UI state.
 *
 * View plugins and demo styles can query this without depending on renderer
 * implementation details.
 */
export const RIVTO_SELECTED_ATTR = "data-rivto-selected";
