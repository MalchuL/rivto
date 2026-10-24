import { useCallback, useSyncExternalStore } from "react";
import { useBlockEditorController } from "./use-block-editor-controller";

/**
 * Reads one block's selected boolean using an addressed subscription.
 *
 * @param blockId - Stable identity of the shell being rendered.
 * @returns Current whole-block membership in this occurrence.
 * @throws If called outside BlockEditor or selection access fails.
 */
export function useBlockSelected(blockId: string): boolean {
  const { selection } = useBlockEditorController().adapter;
  const subscribe = useCallback(
    (listener: () => void) => selection.subscribeBlock(blockId, listener),
    [selection, blockId],
  );
  const getSnapshot = useCallback(() => selection.isBlockSelected(blockId), [selection, blockId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
