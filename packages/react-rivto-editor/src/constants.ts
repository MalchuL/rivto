/**
 * Defines stable DOM attributes, selectors, and classes shared by React block
 * renderers and delegated browser extensions. Attribute/selector pairs remain
 * centralized so producers and consumers cannot silently drift apart.
 *
 * @module
 */
/** Stable DOM attribute placed on every BlockView container. */
export const BLOCK_ID_ATTRIBUTE = "data-block-id";

/** CSS selector matching every BlockView container. */
export const BLOCK_ID_SELECTOR = `[${BLOCK_ID_ATTRIBUTE}]`;

/** Stable DOM attribute placed on every plain-text editable block element. */
export const BLOCK_CONTENT_ATTRIBUTE = "data-block-content";

/** CSS selector matching every plain-text editable block element. */
export const BLOCK_CONTENT_SELECTOR = `[${BLOCK_CONTENT_ATTRIBUTE}]`;

/** Stable DOM attribute placed on each page editor surface root. */
export const PAGE_EDITOR_ROOT_ATTRIBUTE = "data-rivto-page-editor-root";

/** CSS selector matching page editor surface roots in document order. */
export const PAGE_EDITOR_ROOT_SELECTOR = `[${PAGE_EDITOR_ROOT_ATTRIBUTE}]`;

/** Stable DOM attribute placed on the trailing-block mount point. */
export const PAGE_END_SLOT_ATTRIBUTE = "data-page-end-slot";

/** CSS selector matching the trailing-block mount point. */
export const PAGE_END_SLOT_SELECTOR = `[${PAGE_END_SLOT_ATTRIBUTE}]`;

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
 * Opt-in marker for an interactive child that owns its pointer interaction.
 *
 * `useBlockEditing` places this marker alongside a pointer handler that prevents
 * an ancestor preview from entering raw-text mode. Delegated extensions cannot
 * depend on React propagation alone—especially for capture-phase clicks—so the
 * marker also lets structural selection exclude the same region without knowing
 * component-specific classes. It does not disable the marked element's own text
 * editing; it prevents that interaction from activating the parent block.
 */
export const PREVENT_TEXT_EDITING_ATTRIBUTE = "data-prevent-text-editing";

/** CSS selector matching regions that own interaction instead of their parent block. */
export const PREVENT_TEXT_EDITING_SELECTOR = `[${PREVENT_TEXT_EDITING_ATTRIBUTE}]`;

/**
 * CSS class for one block's own row (content and chrome).
 *
 * Nested descendants live outside this row, in the sibling children container.
 * Pointer selection uses that split so a hit in a wrapping gap does not
 * promote the parent.
 */
export const BLOCK_ROW_CLASS = "page-block-row";
