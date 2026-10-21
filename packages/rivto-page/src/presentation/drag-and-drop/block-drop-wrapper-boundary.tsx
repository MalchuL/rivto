import { useContext } from "react";
import {
  BlockChildPlacementContext,
  BlockItemIdentityContext,
} from "../components/block-layout/block-item-context";
import { BlockDropTarget } from "./block-drop-target";

/** Canonical side represented by two non-overlapping strips in the owning wrapper. */
interface BlockDropWrapperBoundaryProps {
  readonly placement: "before" | "after";
}

/**
 * Registers two in-flow insertion regions in the enclosing wrapper's internal grid.
 *
 * Before and after destinations use canonical sibling order from the shared iterator,
 * including when visually adjacent tiles wrap onto different rows. Multiple regions
 * may represent one gap; none implies permission to move a source block. Regions stay
 * inside the wrapper and remain hit-testable without intercepting its center content.
 *
 * @param props - Side of the enclosing BlockItem to expose for insertion.
 * @param props.placement - Before uses top/inline-start; after uses bottom/inline-end.
 * @returns Two grid strips around the wrapper's content without extra parent cells.
 * @throws If outside a matching BlockItem in a real parent's shared child list.
 */
export function BlockDropWrapperBoundary({ placement }: BlockDropWrapperBoundaryProps) {
  const child = useContext(BlockChildPlacementContext);
  const itemId = useContext(BlockItemIdentityContext);
  if (!child?.parentId || itemId !== child.blockId) {
    throw new Error("BlockDropWrapper requires a BlockChildren item with a real parent");
  }
  const destination = {
    kind: "between" as const,
    parentId: child.parentId,
    previousId: placement === "before" ? child.previousId : child.blockId,
    nextId: placement === "before" ? child.blockId : child.nextId,
  };
  return (
    <>
      {["block", "inline"].map((edge) => (
        <BlockDropTarget
          key={edge}
          className="rivto-block-drop-wrapper-boundary"
          data-drop-gap={child.parentId}
          data-drop-placement={placement}
          data-drop-edge={edge}
          destination={destination}
        />
      ))}
    </>
  );
}
