import { createCaretSelection } from "@chulane/rivto";
import type { ReactPanelApi } from "../../../../panels/types";

/**
 * Converts an empty non-list block into a list item in place.
 *
 * @param reactPanel - Editor view whose list-prop registration must be active.
 * @param blockId - Empty block to convert.
 * @returns Nothing; the same block keeps the caret.
 */
export function convertEmptyToList(reactPanel: ReactPanelApi, blockId: string): void {
  reactPanel.blocks.updateBlock(blockId, { listProps: { type: "list", checked: false } });
  reactPanel.selection.set(createCaretSelection(blockId, 0));
}

