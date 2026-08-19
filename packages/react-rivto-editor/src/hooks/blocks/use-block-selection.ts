/**
 * Per-block and full-list selection hooks for React chrome.
 *
 * `useBlockSelected` is a boolean snapshot so growing a block range does not
 * re-render already-selected neighbors. `useBlockSelection` reads the full
 * list and is for chrome that inspects the containing `BlockSelection`.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { BlockSelection } from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";
import { useEditorSelection } from "../editor/use-editor-selection";

/**
 * Returns whether a block is in an active whole-block selection.
 *
 * Text selections return false even when an endpoint is inside this block, so
 * a caret or text range does not paint the complete block as selected.
 *
 * @param blockId - Stable ID whose whole-block membership is queried.
 * @returns True only while a block-selection item contains `blockId`.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockSelected(blockId: string): boolean {
  const { editor } = useEditorContext();
  const subscribe = useCallback(
    (listener: () => void) => editor.selection.subscribe(listener),
    [editor],
  );
  return useSyncExternalStore(
    subscribe,
    () => editor.selection.isBlockSelected(blockId),
    () => editor.selection.isBlockSelected(blockId),
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
export function useBlockSelection(blockId: string): BlockSelection | null {
  const selection = useEditorSelection();
  return selection.find((item): item is BlockSelection => (
    item.type === "block" && item.blockIds.includes(blockId)
  )) ?? null;
}
