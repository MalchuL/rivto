import { RIVTO_BLOCK_ATTR, RIVTO_BLOCK_CONTENT_ATTR } from "../blocks/dom";

/**
 * Selector for rendered block roots.
 *
 * Centralizing this prevents selection helpers from drifting when DOM markers
 * change; several helpers need the exact same boundary.
 */
export const RIVTO_BLOCK_SELECTOR = `[${RIVTO_BLOCK_ATTR}]`;

/**
 * Selector for editable text hosts inside blocks.
 *
 * Browser Selection APIs operate on DOM nodes, so helpers use this selector to
 * climb from text nodes back to Rivto block content.
 */
export const RIVTO_BLOCK_CONTENT_SELECTOR = `[${RIVTO_BLOCK_CONTENT_ATTR}]`;

/**
 * CSS Highlight registry name used for cross-contenteditable selections.
 *
 * Browsers may only paint one contenteditable host during cross-block text
 * selection. This named highlight paints the missing selected ranges.
 */
export const RIVTO_CROSS_SELECTION_HIGHLIGHT = "rivto-cross-selection";

/**
 * Fallback attribute for cross-block selection paint when CSS Highlights are
 * not available.
 */
export const RIVTO_CROSS_SELECTED_ATTR = "data-rivto-cross-selected";

/**
 * Marks the editor root while React is synthesizing pointer text selection.
 *
 * Native `selectionchange` can report truncated intermediate ranges across
 * separate contenteditable hosts; this guard prevents those events from
 * overwriting the correct editor selection.
 */
export const RIVTO_POINTER_SELECTING_ATTR = "data-rivto-pointer-selecting";

/**
 * CSS class for the temporary rectangle drawn during block/object selection.
 *
 * The rectangle is visual-only; block IDs are still resolved from DOM geometry.
 */
export const RIVTO_SELECTION_RECT_CLASS = "rv-selection-rect";
