import { useCallback, useSyncExternalStore } from "react";
import { useReactPanel } from "../../hooks";

/**
 * Tracks whether a card contains one root outside the default writing block role.
 *
 * The subscription returns only the type, so changes to other block fields do
 * not re-render the card. Nested children do not count as additional roots.
 *
 * @param blockIds - Ordered root IDs currently projected into the card.
 * @returns Whether the card should omit its visible chrome and padding.
 */
export function useHasSingleNonDefaultWritingRoot(blockIds: readonly string[]): boolean {
  const panel = useReactPanel();
  const rootId = blockIds.length === 1 ? blockIds[0] : undefined;
  const subscribe = useCallback(
    (listener: () => void) =>
      rootId ? panel.blocks.subscribeBlockNode(rootId, listener) : () => {},
    [panel, rootId],
  );
  const getRootType = useCallback(
    () => (rootId ? panel.blocks.getBlockNode(rootId)?.type : undefined),
    [panel, rootId],
  );
  const type = useSyncExternalStore(subscribe, getRootType, getRootType);
  return type !== undefined && !panel.editor.defaultWritingBlockFactory.isBlock({ type });
}
