/**
 * Per-block and full-list selection hooks for React chrome.
 *
 * `useBlockSelected` is a boolean snapshot so growing a block range does not
 * re-render already-selected neighbors. `useBlockSelection` reads the full
 * list and is for chrome that inspects the containing block payload.
 */
import { hasBlockRanges, type Selection } from "@chulane/rivto";
import { useCallback, useSyncExternalStore } from "react";
import { useEditorView } from "../../editor-view/use-editor-view";
import { useEditorSelection } from "../editor/use-editor-selection";

/**
 * Returns whether a block is in an active whole-block selection.
 *
 * Text selections return false even when an endpoint is inside this block, so
 * a caret or text range does not paint the complete block as selected.
 *
 * @param blockId - Stable ID whose whole-block membership is queried.
 * @returns True only while a structural selection contains `blockId`.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockSelected(blockId: string): boolean {
  const editorView = useEditorView();
  const subscribe = useCallback(
    (listener: () => void) => editorView.selection.subscribe(listener),
    [editorView],
  );
  return useSyncExternalStore(
    subscribe,
    () => editorView.selection.isBlockSelected(blockId),
    () => editorView.selection.isBlockSelected(blockId),
  );
}

/**
 * Returns the active whole-block selection containing a given block.
 *
 * Text selections deliberately return null—even when an endpoint is
 * inside this block—because a caret or text range must not make the complete
 * block appear selected. The returned selection is the store snapshot and
 * changes identity whenever the full selection list changes.
 *
 * @param blockId - Stable ID whose whole-block selection membership is queried.
 * @returns The containing block selection, or null when not selected.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockSelection(blockId: string): Selection | null {
  const selection = useEditorSelection();
  return selection && hasBlockRanges(selection)
    && selection.blocks.some((block) => block.id === blockId && block.start === 0 && block.end === -1)
    ? selection : null;
}
