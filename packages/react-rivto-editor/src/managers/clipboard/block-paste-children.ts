import type { EditorBlockNode } from "@chulane/rivto";

/** Shared function consulted when choosing whether a structural paste enters a block. */
export const BLOCK_PASTE_CHILDREN_KEY = "rivto.clipboard.paste-into-children";

/**
 * Decides whether structural paste may enter the addressed block's children.
 *
 * @param block - Current detached block node in the destination panel.
 * @returns True when the block accepts a paste at the start of its children.
 */
export type BlockPasteChildren = (block: EditorBlockNode) => boolean;
