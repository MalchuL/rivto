/** Preferred tile width, shared by layout placement and resize commit. */
export const BENTO_WIDTH_PROPERTY = "--rivto-bento-width";
/** Maximum preferred placement width, also used for content-sized tiles. */
export const BENTO_MAX_WIDTH_PROPERTY = "--rivto-bento-max-width";
/** Explicit Page placement element; the contained block retains its sole identity. */
export const BENTO_TILE_ITEM_CLASS = "rivto-bento-tile";
/** Block plugin-data key for a tile's Bento-only preferred width in CSS pixels. */
export const BENTO_WIDTH_PLUGIN_ID = "bentoWidth";
/** Original block style width retained while a block is a Bento tile. */
export const BENTO_ORIGINAL_WIDTH_PLUGIN_ID = "bentoOriginalWidth";
/** Block plugin-data key for a tile's saved height and overflow policy. */
export const BENTO_HEIGHT_PLUGIN_ID = "bentoHeight";
/** Height and policy captured before a block enters Bento. */
export const BENTO_ORIGINAL_HEIGHT_PLUGIN_ID = "bentoOriginalHeight";
