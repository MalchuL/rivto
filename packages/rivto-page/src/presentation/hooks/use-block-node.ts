import type { BlockEditorNode } from "../../adapter/types";
import { useCallback, useSyncExternalStore } from "react";
import { useBlockEditorController } from "./use-block-editor-controller";

/**
 * Subscribes to one block's own fields without materializing its descendants.
 *
 * @param blockId - Stable identity within the current adapter's region.
 * @returns Detached cached node, or undefined when deleted, unknown, or outside.
 * @throws If called outside BlockEditor or an adapter read/subscription fails.
 */
export function useBlockNode(blockId: string): BlockEditorNode | undefined {
  const { blocks } = useBlockEditorController().adapter;
  const subscribe = useCallback(
    (listener: () => void) => blocks.subscribeBlockNode(blockId, listener),
    [blocks, blockId],
  );
  const getSnapshot = useCallback(() => blocks.getBlockNode(blockId), [blocks, blockId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
