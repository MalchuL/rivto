import { useBlockRegion } from "./use-block-region";
import type { RegionIdentity } from "@chulane/rivto-root";
import type { BlockItemContentProps, BlockItemFrameProps, BlockItemProps } from "./types";
import {
  BlockChildPlacementContext,
  BlockItemIdentityContext,
  BlockItemControlsContext,
  BlockChildrenControlsContext,
} from "./block-item-context";
import { useBlockNode } from "../../hooks/use-block-node";
import { forwardRef, useContext, useMemo } from "react";

export type { BlockItemProps } from "./types";

/**
 * Provides optional item geometry without introducing another block identity.
 *
 * Host layouts supply widths through style; resize controls may share this wrapper.
 * The item's own border box includes in-flow content and padding, not overflow
 * from absolute slots. Native slot hits remain reachable outside that box.
 * Item chrome reveals the owning row's handle; native nested rows retain priority.
 * The nested BlockNode remains the sole owner of its data-block-id and content.
 * A decorator supplies its existing block snapshot without adding a subscription.
 * Placement items without that snapshot observe their own node's list decoration.
 * Supplying a snapshot does not invent a document parent or canonical neighbors. Nested
 * items representing the same block retain the outer item as the sole counter owner.
 *
 * @param props - Native attributes, sizing parameters, and composed child/control JSX.
 * @param props.block - Current borrowed snapshot; omission subscribes to the child placement ID.
 * @param props.controlsPlacement - Inside reserves row width for the left-top slot; outside keeps perimeter positioning. Omission inherits the child layout, or outside at the editor root. Applies only to this item's block.
 * @param props.className - Additional classes appended to the package item hook.
 * @param props.children - The already-rendered child and optional host controls.
 * @param props.bindInput - Optional normalized input setup for this item's mounted identity.
 * @param ref - Optional ref receiving the item's opaque identity for Root operations.
 * @returns A package-styled placement wrapper, not a second block shell.
 * @throws If outside BlockEditor, neither a block snapshot nor a BlockChildren
 * placement exists, or delegated node reads/subscriptions fail. Snapshot-backed
 * decorators also require the editor to register their mounted placement region.
 */
export const BlockItem = forwardRef<RegionIdentity, BlockItemProps>(function BlockItem(
  { block, className, children, ...attributes },
  ref,
) {
  const placement = useContext(BlockChildPlacementContext);
  if (block) {
    return (
      <BlockItemFrame
        {...attributes}
        className={className}
        ref={ref}
        blockId={block.id}
        listType={block.listType}
      >
        {children}
      </BlockItemFrame>
    );
  }
  if (!placement) {
    throw new Error("BlockItem requires block or a BlockChildren item component");
  }
  return (
    <BlockItemContent {...attributes} className={className} ref={ref} blockId={placement.blockId}>
      {children}
    </BlockItemContent>
  );
});

/**
 * Keeps list counters on the optional outer item without creating a second block identity.
 *
 * @param props - Child identity and native placement attributes.
 * @param props.blockId - Actual child whose list type is reflected on the placement wrapper.
 * @param ref - Optional ref receiving the item's opaque identity for Root operations.
 * @returns A placement wrapper with the supplied child; only the outermost item
 * for this node owns its sibling counter.
 * @throws If outside BlockEditor or delegated node reads/subscriptions fail.
 */
const BlockItemContent = forwardRef<RegionIdentity, BlockItemContentProps>(
  function BlockItemContent({ blockId, className, children, ...attributes }, ref) {
    const node = useBlockNode(blockId);
    const snapshot = node.getSnapshot();
    return (
      <BlockItemFrame
        {...attributes}
        className={className}
        ref={ref}
        blockId={blockId}
        listType={snapshot?.listType}
      >
        {children}
      </BlockItemFrame>
    );
  },
);

/**
 * Places a supplied child and marks only its outermost item as the counter owner.
 *
 * @param props - Native attributes and captured identity/list decoration.
 * @param props.blockId - Stable ID used to distinguish nested wrappers for the same block.
 * @param props.listType - Current list decoration, or undefined for an undecorated/missing node.
 * @param props.controlsPlacement - Row placement for this block only; omission inherits the child layout, or outside at the editor root.
 * @param props.className - Host classes appended to the package placement class.
 * @param props.children - Already-rendered node or next decorator, rendered once.
 * @param props.bindInput - Optional setup for normalized input on this mounted item.
 * @param ref - Optional ref receiving this item's opaque identity.
 * @returns One placement div without reading or subscribing to document data.
 * @throws Propagates region registration, input binding, and cleanup failures.
 */
const BlockItemFrame = forwardRef<RegionIdentity, BlockItemFrameProps>(function BlockItemFrame(
  { blockId, listType, className, children, controlsPlacement, bindInput, ...attributes },
  ref,
) {
  const outerItem = useContext(BlockItemIdentityContext);
  const itemRef = useBlockRegion(blockId, "item", ref, bindInput);
  const inheritedControls = useContext(BlockChildrenControlsContext);
  const placement = controlsPlacement ?? inheritedControls;
  const controls = useMemo(() => ({ blockId, placement }), [blockId, placement]);
  return (
    <BlockItemIdentityContext.Provider value={blockId}>
      <div
        {...attributes}
        ref={itemRef}
        data-block-item-id={blockId}
        data-block-in-item={outerItem === blockId || undefined}
        data-block-list-type={listType}
        className={["rivto-block-item", className].filter(Boolean).join(" ")}
      >
        <BlockItemControlsContext.Provider value={controls}>
          {children}
        </BlockItemControlsContext.Provider>
      </div>
    </BlockItemIdentityContext.Provider>
  );
});
