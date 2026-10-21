import { useCallback, useSyncExternalStore } from "react";
import { useBlockEditorController } from "../../hooks/use-block-editor-controller";
import { BlockList } from "../block-layout/block-list";

/**
 * Observes the host-selected display list independently of individual node edits.
 *
 * @returns Listed blocks and their real descendants; an empty list renders no nodes.
 * @throws If called outside BlockEditor or list reads/subscriptions fail.
 */
export function BlockTree() {
  const { blocks } = useBlockEditorController().adapter;
  const subscribe = useCallback(
    (listener: () => void) => blocks.subscribeBlockIds(listener),
    [blocks],
  );
  const getSnapshot = useCallback(() => blocks.getBlockIds(), [blocks]);
  const blockIds = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return <BlockList blockIds={blockIds} />;
}
