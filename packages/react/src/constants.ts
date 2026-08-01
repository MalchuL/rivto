/** Stable DOM attribute placed on every BlockView container. */
export const BLOCK_ID_ATTRIBUTE = "data-block-id";

/** CSS selector matching every BlockView container. */
export const BLOCK_ID_SELECTOR = `[${BLOCK_ID_ATTRIBUTE}]`;

/** Stable DOM attribute placed on every plain-text editable block element. */
export const BLOCK_CONTENT_ATTRIBUTE = "data-block-content";

/** CSS selector matching every plain-text editable block element. */
export const BLOCK_CONTENT_SELECTOR = `[${BLOCK_CONTENT_ATTRIBUTE}]`;

/**
 * Opt-in marker for a renderer region from which selection may begin.
 *
 * Every `useBlockEditing` mode returns this marker. The text-selection extension uses
 * the marked element's native `isContentEditable` state to distinguish text
 * editing from structural selection; `data-block-content` remains responsible
 * only for persisted text offsets and DOM range conversion.
 */
export const BLOCK_SELECTION_ANCHOR_ATTRIBUTE = "data-block-selection-anchor";

/** CSS selector matching renderer regions that may begin selection gestures. */
export const BLOCK_SELECTION_ANCHOR_SELECTOR = `[${BLOCK_SELECTION_ANCHOR_ATTRIBUTE}]`;

/**
 * Logic-owned selector for cross-block text selection fallback highlighting.
 *
 * Selection cleanup queries this marker after it is written on engines without
 * CSS Custom Highlight. Text offsets remain in editor selection state and are
 * never derived from the marker.
 */
export const TEXT_SELECTION_FALLBACK_SELECTOR = "[data-text-selection-fallback]";
