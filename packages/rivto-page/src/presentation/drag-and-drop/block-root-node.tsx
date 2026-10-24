import type { BlockChildPlacement } from "../components/block-layout/block-item-context";
import { BlockNode } from "../components/block-layout/block-node";
import { BlockRootPlacementContext } from "./block-root-placements";
import { useCallback, useContext, useSyncExternalStore, memo } from "react";
import { useBlockEditorController } from "../hooks/use-block-editor-controller";
import { BlockDropItem } from "./block-drop-item";

/** One displayed root, which need not share a parent with other displayed roots. */
export interface BlockRootNodeProps {
  readonly blockId: string;
}

/**
 * Observes actual sibling order for a projected root and declares its boundaries.
 *
 * Hidden neighbors retain their canonical IDs. Document roots borrow one shared
 * occurrence subscription; projected children observe only their actual parent.
 * The view owns those subscriptions and their cleanup;
 * unmounting a virtual root removes its regions without creating spacer targets.
 *
 * @param props - Stable identity of the displayed subtree.
 * @param props.blockId - Root whose actual parent supplies insertion neighbors.
 * @returns One addressed subtree with live ordinary outline boundaries.
 */
export const BlockRootNode = memo(function BlockRootNode({ blockId }: BlockRootNodeProps) {
  const placement = useBlockRootPlacement(blockId);
  if (!placement) {
    return <BlockNode blockId={blockId} />;
  }
  return <BlockRootNodeView {...placement} />;
});

/**
 * Retains a root's mounted regions and node when other roots change their order.
 *
 * Primitive neighbor fields are compared by React.memo, independently of the
 * occurrence's root-map identity. Only changed placements render new regions.
 *
 * @param props - Real root placement supplied by the shared occurrence snapshot.
 * @param props.blockId - The single node rendered inside these insertion regions.
 * @returns One canonical node surrounded by ordinary outline boundaries.
 */
const BlockRootNodeView = memo(function BlockRootNodeView(props: BlockChildPlacement) {
  return (
    <BlockDropItem placement={props} axis="vertical" outline>
      <BlockNode blockId={props.blockId} />
    </BlockDropItem>
  );
});

/**
 * Observes the actual neighbors of a displayed root without requiring its DOM node.
 *
 * Document roots borrow the shared occurrence store. Projected roots subscribe
 * only to their canonical parent's child order. React releases subscriptions on
 * identity changes and unmount; unchanged placement snapshots retain identity.
 *
 * @param blockId - Existing displayed root, including a currently virtualized root.
 * @returns Canonical placement, or undefined when the block is absent from its parent's children.
 * @throws If outside an editor or delegated adapter reads fail.
 */
export function useBlockRootPlacement(blockId: string): BlockChildPlacement | undefined {
  const { blocks } = useBlockEditorController().adapter;
  const parentId = blocks.getParentId(blockId) ?? null;
  const roots = useContext(BlockRootPlacementContext);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (parentId === null) {
        return () => {};
      }
      return blocks.subscribeBlockNode(parentId, listener);
    },
    [blocks, parentId],
  );
  const read = useCallback(
    () => (parentId === null ? undefined : blocks.getBlockNode(parentId)?.childIds),
    [blocks, parentId],
  );
  const siblings = useSyncExternalStore(subscribe, read, read);
  const index = siblings?.indexOf(blockId) ?? -1;
  const subscribeRoot = useCallback(
    (listener: () => void) => {
      if (parentId !== null) {
        return () => {};
      }
      return roots?.subscribe(blockId, listener) ?? (() => {});
    },
    [parentId, roots, blockId],
  );
  let placement = useSyncExternalStore(
    subscribeRoot,
    () => roots?.get(blockId),
    () => roots?.get(blockId),
  );
  if (parentId !== null) {
    placement =
      siblings && index >= 0
        ? {
            blockId,
            parentId,
            previousId: siblings[index - 1] ?? null,
            nextId: siblings[index + 1] ?? null,
          }
        : undefined;
  }
  return placement;
}
