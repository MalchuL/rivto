import { BlockChildPlacementContext } from "./block-item-context";
import { Fragment, memo, type ComponentType, type ReactNode } from "react";
import { BlockNode } from "./block-node";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";

/** Optional host placement of one child; the child node is supplied by Page. */
export interface BlockChildrenItemProps {
  readonly blockId: string;
  readonly children: ReactNode;
}

/** Live neighbors of one canonical gap in a real parent's child list. */
export interface BlockChildrenGapProps {
  readonly parentId: string | null;
  readonly previousId: string | null;
  readonly nextId: string | null;
}

/** Stable immediate IDs and optional host placement components. */
export interface BlockListProps {
  readonly blockIds: readonly string[];
  readonly parentId?: string | null;
  readonly item?: ComponentType<BlockChildrenItemProps>;
  readonly gap?: ComponentType<BlockChildrenGapProps>;
}

/**
 * Traverses only a display or child list whose identity or order has changed.
 *
 * Each item retains its keyed node across sibling reordering. Gap components
 * receive canonical neighbors; they do not derive document parents from DOM.
 * Optional items also receive private canonical placement for item-local grid targets.
 * No item wrapper or gap DOM is added unless the layout supplies those components.
 *
 * @param props - Stable IDs and optional real-parent placement components.
 * @param props.blockIds - Ordered unique IDs, excluding materialized descendants.
 * @param props.parentId - Actual parent, null for document roots; omitted for an arbitrary display list.
 * @param props.item - Optional wrapper receiving an already-rendered BlockNode.
 * @param props.gap - Optional gap component, used only with an actual parent.
 * @returns Keyed memoized nodes and optional gaps without a list wrapper.
 */
export const BlockList = memo(function BlockList({
  blockIds,
  parentId,
  item: Item,
  gap: Gap,
}: BlockListProps) {
  return (
    <>
      {blockIds.map((blockId, index) => {
        const node = <BlockNode blockId={blockId} />;
        return (
          <Fragment key={`node:${blockId}`}>
            {Gap && parentId !== undefined && (
              <span className={BLOCK_EDITOR_CLASSES.listGap}>
                <Gap
                  parentId={parentId}
                  previousId={blockIds[index - 1] ?? null}
                  nextId={blockId}
                />
              </span>
            )}
            {Item ? (
              <BlockChildPlacementContext.Provider
                value={{
                  blockId,
                  parentId,
                  previousId: blockIds[index - 1] ?? null,
                  nextId: blockIds[index + 1] ?? null,
                }}
              >
                <Item blockId={blockId}>{node}</Item>
              </BlockChildPlacementContext.Provider>
            ) : (
              node
            )}
          </Fragment>
        );
      })}
      {Gap && parentId !== undefined && (
        <span className={BLOCK_EDITOR_CLASSES.listGap}>
          <Gap parentId={parentId} previousId={blockIds.at(-1) ?? null} nextId={null} />
        </span>
      )}
    </>
  );
});
