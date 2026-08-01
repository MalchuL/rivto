import type { BlockSelection } from "@chulane/rivto";
import { useEditorSelection } from "../editor/use-editor-selection";

/**
 * Returns the active whole-block selection containing a given block.
 *
 * Text selections deliberately return null—even when an endpoint is
 * inside this block—because a caret or text range must not make the complete
 * block appear selected. The returned selection is detached by SelectionManager
 * and can be inspected for group IDs or anchor/focus information.
 *
 * @param blockId - Stable ID whose whole-block selection membership is queried.
 * @returns The containing block selection, or null when not selected.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockSelection(blockId: string): BlockSelection | null {
  return useEditorSelection().find((selection): selection is BlockSelection => (
    selection.type === "block" && selection.blockIds.includes(blockId)
  )) ?? null;
}
