import { Slot } from "radix-ui";
import { forwardRef, useCallback, useContext, useRef, type ReactNode } from "react";
import { BlockItem, type BlockItemProps } from "../components/block-layout/block-item";
import { BlockChildPlacementContext } from "../components/block-layout/block-item-context";
import { useBlockDropRegions } from "./block-drop-layout";
import { BlockDropDepthContext, useBlockDropEdges } from "./block-drop-item";

/** Existing placement attributes with independently declared edge geometry. */
export interface BlockDropWrapperProps extends Omit<BlockItemProps, "block"> {
  /** Vertical uses block edges, horizontal uses inline edges, grid uses all four. */
  readonly axis?: "vertical" | "horizontal" | "grid";
  /** Local CSS-pixel edge thickness; omission inherits the shared target-size token. */
  readonly targetSize?: number;
  readonly children?: ReactNode;
}

/**
 * Declares insertion edges on one existing placement without creating hit-area elements.
 *
 * The item retains its counter, identity, content and measurement ref. Its content
 * wrapper remains a positioning container for controls. Presentation padding is
 * independent from targetSize: changing drop geometry never changes layout width.
 * Top/inline-start declare before and bottom/inline-end declare after, including RTL.
 * Block-end boundaries inherit the list's outline depth policy through the same
 * declaration builder as linear items; inline grid seams remain sibling placement.
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
    { className, children, axis = "grid", targetSize, ...attributes },
    ref,
  ) {
    const placement = useContext(BlockChildPlacementContext);
    const element = useRef<HTMLDivElement>(null);
    const anchor = useCallback(() => element.current, []);
    if (placement?.parentId === undefined) {
      throw new Error("BlockDropWrapper requires a canonical child placement");
    }
    const { regions, depth } = useBlockDropEdges({
      placement,
      axis,
      outline: placement.dropPlacement !== "siblings",
      size: targetSize,
    });
    useBlockDropRegions(anchor, regions, placement.blockId);
    return (
      <Slot.Root ref={ref}>
        <BlockItem
          {...attributes}
          ref={element}
          data-drop-wrapper-axis={axis}
          className={["rivto-block-drop-wrapper", className].filter(Boolean).join(" ")}
        >
          <BlockDropDepthContext.Provider value={depth}>
            <div className="rivto-block-drop-wrapper-content">{children}</div>
          </BlockDropDepthContext.Provider>
        </BlockItem>
      </Slot.Root>
    );
  },
);
