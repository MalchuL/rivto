/**
 * Marks the DOM element that represents one rendered block.
 *
 * React selection and event bridges use this marker to map browser events back
 * to document block IDs without depending on the block component structure.
 */
export const RIVTO_BLOCK_ATTR = "data-rivto-block-id";

/**
 * Marks the editable content element inside a rendered block.
 *
 * Selection helpers use this marker to translate DOM ranges into block-local
 * offsets while allowing headings, paragraphs, and custom block components.
 */
export const RIVTO_BLOCK_CONTENT_ATTR = "data-rivto-block-content";

/**
 * Marks a rendered block as selected by local editor UI state.
 *
 * Styles and tests can read this attribute without knowing how a block renderer
 * computes its selected state.
 */
export const RIVTO_SELECTED_ATTR = "data-rivto-selected";
