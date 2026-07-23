/** Stable DOM attribute placed on every BlockView container. */
export const BLOCK_ID_ATTRIBUTE = "data-block-id";

/** CSS selector matching every BlockView container. */
export const BLOCK_ID_SELECTOR = `[${BLOCK_ID_ATTRIBUTE}]`;

/** Stable DOM attribute containing the persisted native block type. */
export const BLOCK_TYPE_ATTRIBUTE = "data-block-type";

/** CSS selector matching elements that expose a native block type. */
export const BLOCK_TYPE_SELECTOR = `[${BLOCK_TYPE_ATTRIBUTE}]`;

/** Stable DOM attribute placed on every plain-text editable block element. */
export const BLOCK_CONTENT_ATTRIBUTE = "data-block-content";

/** CSS selector matching every plain-text editable block element. */
export const BLOCK_CONTENT_SELECTOR = `[${BLOCK_CONTENT_ATTRIBUTE}]`;

/** Stable DOM attribute present on a BlockView while it is selected. */
export const BLOCK_SELECTED_ATTRIBUTE = "data-selected";

/** CSS selector matching selected BlockView containers. */
export const BLOCK_SELECTED_SELECTOR = `[${BLOCK_SELECTED_ATTRIBUTE}]`;

/** Fallback marker placed on editable content touched by cross-block text selection. */
export const TEXT_SELECTED_ATTRIBUTE = "data-text-selected";

/** CSS selector matching fallback cross-block text-selection markers. */
export const TEXT_SELECTED_SELECTOR = `[${TEXT_SELECTED_ATTRIBUTE}]`;
