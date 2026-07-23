import type { BlockSelection, EdgelessSelection } from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";

/** Whole-block selection variants that can contain a block ID. */
export type SelectedBlockState = BlockSelection | EdgelessSelection;

/**
 * Returns the active whole-block selection containing a given block.
 *
 * Both ordered page block selections and edgeless object selections are
 * supported. Text selections deliberately return null—even when an endpoint is
 * inside this block—because a caret or text range must not make the complete
 * block appear selected. The returned selection is detached by SelectionManager
 * and can be inspected for group IDs or page anchor/focus information.
 *
 * @param blockId - Stable ID whose whole-block selection membership is queried.
 * @returns The containing block/edgeless selection, or null when not selected.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockSelection(blockId: string): SelectedBlockState | null {
  const { editor } = useEditorContext();
  return editor.selection.get().find((selection): selection is SelectedBlockState => (
    selection.type !== "text" && selection.blockIds.includes(blockId)
  )) ?? null;
}
