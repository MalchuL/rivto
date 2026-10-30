import { BlockDropDepthContext, BlockDropItem } from "../../drag-and-drop/block-drop-item";
import { BlockChildPlacementContext } from "./block-item-context";
import { Fragment, memo, type ComponentType, type ReactNode } from "react";
import { BlockNode } from "./block-node";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";

/** Optional host placement of one child; the child node is supplied by Page. */
export interface BlockChildrenItemProps {
  readonly blockId: string;
  readonly children: ReactNode;
}

/** Stable immediate IDs and optional host placement components. */
export interface BlockListProps {
  readonly blockIds: readonly string[];
  readonly parentId?: string | null;
  readonly item?: ComponentType<BlockChildrenItemProps>;
  /** Standard linear edge regions; grid items declare their placement edges. */
  readonly dropAxis?: "vertical" | "horizontal" | "grid";
  /** Outline declares depth bands; siblings declares one destination per gap. */
  readonly dropPlacement?: "outline" | "siblings";
}

/**
 * Traverses only a display or child list whose identity or order has changed.
 *
 * Each item retains its keyed node across sibling reordering. Region declarations
 * receive canonical neighbors; they do not derive document parents from DOM.
 * Optional items also receive private canonical placement for item-local grid targets.
 * Real-parent linear lists supply standard item-owned edges on their existing shells.
 * Grid items supply their own wrapping edges, and projected lists
 * without a real parent add no implicit sibling targets. Filtering an item removes
 * its standard boundaries together with its already-rendered child.
 * Linear boundary owners remain inside the optional item so its visibility controls
 * their registration lifetime. Grid/projection depth resets surround the item;
 * a wrapping item can then provide its own terminal levels to its child subtree.
 *
 * @param props - Stable IDs and optional real-parent placement components.
 * @param props.blockIds - Ordered unique IDs, excluding materialized descendants.
 * @param props.parentId - Actual parent, null for document roots; omitted for an arbitrary display list.
 * @param props.item - Optional wrapper receiving an already-rendered BlockNode.
 * @param props.dropAxis - Linear flow for standard boundaries; grid delegates placement edges to items.
 * @param props.dropPlacement - Outline exposes depth bands; siblings keeps the receiving parent fixed.
 * @returns Keyed memoized nodes and canonical regions without a list wrapper.
 */
export const BlockList = memo(function BlockList({
  blockIds,
  parentId,
  item: Item,
  dropAxis = "vertical",
  dropPlacement = "outline",
}: BlockListProps) {
  const outline = dropPlacement === "outline";
  return (
    <>
      {blockIds.map((blockId, index) => {
        const placement = {
          blockId,
          parentId,
          dropPlacement,
          previousId: blockIds[index - 1] ?? null,
          nextId: blockIds[index + 1] ?? null,
        };
        const automatic = parentId !== undefined && dropAxis !== "grid";
        const node = automatic ? (
          <BlockDropItem placement={placement} axis={dropAxis} outline={outline}>
            <BlockNode blockId={blockId} />
          </BlockDropItem>
        ) : (
          <BlockNode blockId={blockId} />
        );
        const content = Item ? (
          <BlockChildPlacementContext.Provider value={placement}>
            <Item blockId={blockId}>{node}</Item>
          </BlockChildPlacementContext.Provider>
        ) : (
          node
        );
        return (
          <Fragment key={`node:${blockId}`}>
            {automatic ? (
              content
            ) : (
              <BlockDropDepthContext.Provider value={null}>
                {content}
              </BlockDropDepthContext.Provider>
            )}
          </Fragment>
        );
      })}
    </>
  );
});
