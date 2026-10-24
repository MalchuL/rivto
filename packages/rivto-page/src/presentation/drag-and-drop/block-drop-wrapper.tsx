import { Slot } from "radix-ui";
import { forwardRef, useCallback, useContext, useRef, type ReactNode } from "react";
import { BlockDropTarget } from "./block-drop-target";
import { BlockItem, type BlockItemProps } from "../components/block-layout/block-item";
import { BlockChildPlacementContext } from "../components/block-layout/block-item-context";
import { useBlockDropRegions } from "./block-drop-layout";
import type { BlockDropRegion } from "../../editor/drag-and-drop/types";

/** Existing placement attributes with independently declared edge geometry. */
export interface BlockDropWrapperProps extends Omit<BlockItemProps, "block"> {
  /** Vertical uses block edges, horizontal uses inline edges, grid uses all four. */
  readonly axis?: "vertical" | "horizontal" | "grid";
  /** Local CSS-pixel edge thickness; omission inherits the shared target-size token. */
  readonly targetSize?: number;
  /** Optional declarations on the existing content frame, independent of outer insertion edges. */
  readonly contentRegions?: readonly BlockDropRegion[];
  readonly children?: ReactNode;
}

/**
 * Declares insertion edges on one existing placement without creating hit-area elements.
 *
 * The item retains its counter, identity, content and measurement ref. Its content
 * wrapper remains a positioning container for controls. Presentation padding is
 * independent from targetSize: changing drop geometry never changes layout width.
 * Top/inline-start mean before, bottom/inline-end mean after, including RTL.
 *
 * @param props - Existing native placement attributes and its already-rendered node.
 * @param props.axis - Edges to enable; defaults to all four for wrapping layouts.
 * @param props.targetSize - Optional edge thickness in local CSS pixels.
 * @param props.children - Single existing subtree and host controls, rendered once.
 * @param ref - Existing measurement ref, preserved on replacement and unmount.
 * @returns One ordinary placement item and its positioned content, without boundary strips.
 * @throws If outside a canonical child placement or registration/ref callbacks fail.
 */
export const BlockDropWrapper = forwardRef<HTMLDivElement, BlockDropWrapperProps>(
  function BlockDropWrapper(
    { className, children, axis = "grid", targetSize, contentRegions = [], ...attributes },
    ref,
  ) {
    const placement = useContext(BlockChildPlacementContext);
    const element = useRef<HTMLDivElement>(null);
    const anchor = useCallback(() => element.current, []);
    if (placement?.parentId === undefined) {
      throw new Error("BlockDropWrapper requires a canonical child placement");
    }
    const before = {
      kind: "between" as const,
      parentId: placement.parentId,
      previousId: placement.previousId,
      nextId: placement.blockId,
    };
    const after = {
      kind: "between" as const,
      parentId: placement.parentId,
      previousId: placement.blockId,
      nextId: placement.nextId,
    };
    const regions: BlockDropRegion[] = [];
    if (axis !== "horizontal") {
      regions.push(
        { kind: "edge", side: "block-start", size: targetSize, destination: before },
        { kind: "edge", side: "block-end", size: targetSize, destination: after },
      );
    }
    if (axis !== "vertical") {
      regions.push(
        { kind: "edge", side: "inline-start", size: targetSize, destination: before },
        { kind: "edge", side: "inline-end", size: targetSize, destination: after },
      );
    }
    useBlockDropRegions(anchor, regions, placement.blockId);
    return (
      <Slot.Root ref={ref}>
        <BlockItem
          {...attributes}
          ref={element}
          data-drop-wrapper-axis={axis}
          className={["rivto-block-drop-wrapper", className].filter(Boolean).join(" ")}
        >
          <BlockDropTarget asChild regions={contentRegions}>
            <div className="rivto-block-drop-wrapper-content">{children}</div>
          </BlockDropTarget>
        </BlockItem>
      </Slot.Root>
    );
  },
);
