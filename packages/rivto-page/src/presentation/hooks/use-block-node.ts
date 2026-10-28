import type { BlockEditorNodeApi } from "../../editor/blocks/block-editor-node-api";
import { useCallback, useSyncExternalStore } from "react";
import { useBlockEditorController } from "./use-block-editor-controller";

/**
 * Subscribes to one ID's snapshot and returns its stable live node object.
 *
 * Host snapshot identity drives React updates; the object itself stays unchanged.
 * Read its getters or getSnapshot during rendering and invoke its commands for writes.
 * Descendants remain addressed separately rather than materialized into a subtree.
 *
 * @param blockId - Stable identity within the current adapter.
 * @returns Cached borrowed node API without destruction, including for missing IDs
 * whose getSnapshot returns undefined. The controller retains the same object for teardown.
 * @throws If called outside BlockEditor, its controller is destroyed, or delegated
 * reads/subscriptions fail.
 */
export function useBlockNode(blockId: string): BlockEditorNodeApi {
  const node = useBlockEditorController().getNode(blockId);
  const subscribe = useCallback((listener: () => void) => node.subscribe(listener), [node]);
  const getSnapshot = useCallback(() => node.getSnapshot(), [node]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return node;
}
