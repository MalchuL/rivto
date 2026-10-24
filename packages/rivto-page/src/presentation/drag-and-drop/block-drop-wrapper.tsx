import { forwardRef, type ReactNode } from "react";
import { BlockItem, type BlockItemProps } from "../components/block-layout/block-item";
import { BlockDropWrapperBoundary } from "./block-drop-wrapper-boundary";

/** Native placement attributes around already-rendered content and insertion boundaries. */
export interface BlockDropWrapperProps extends Omit<BlockItemProps, "block"> {
  /** Vertical reserves top/bottom, horizontal reserves inline edges; grid reserves all four by default. */
  readonly axis?: "vertical" | "horizontal" | "grid";
  /** Existing block node and host controls; rendered once in the center of the wrapper. */
  readonly children?: ReactNode;
}

/**
 * Reserves axis-selected insertion boundaries around content without covering its pointer input.
 *
 * One wrapper is one grid cell or flex item. It composes BlockItem so the existing
 * child retains its identity, addressed subscriptions, and single sibling counter.
 * Boundary thickness uses --rivto-drop-gap-size (8px by default); native width includes
 * both inline strips. Use zero child-host gap when the boundaries provide all spacing.
 * Top and inline-start mean before; bottom and inline-end mean after, including RTL.
 * The center is a positioning container so absolute content controls do not
 * extend their containing block across the reserved insertion strips.
 *
 * @param props - Native placement attributes and already-rendered block content.
 * @param props.controlsPlacement - Forwarded to BlockItem for this child's left-top controls; omission inherits the child layout, or outside at the editor root.
 * @param props.className - Additional classes appended to the package wrapper class.
 * @param props.axis - Flow direction selecting the in-flow insertion strips; defaults to grid.
 * @param props.children - Block node and optional controls placed inside the four boundaries.
 * @param ref - Optional measurement ref forwarded to the existing outer BlockItem.
 * @returns One counter-owning placement item with content and two or four always-active targets.
 * @throws If outside a BlockChildren item with a real parent, or target registration fails.
 */
export const BlockDropWrapper = forwardRef<HTMLDivElement, BlockDropWrapperProps>(
  function BlockDropWrapper({ className, children, axis = "grid", ...attributes }, ref) {
    return (
      <BlockItem
        {...attributes}
        ref={ref}
        data-drop-wrapper-axis={axis}
        className={["rivto-block-drop-wrapper", className].filter(Boolean).join(" ")}
      >
        <BlockDropWrapperBoundary placement="before" axis={axis} />
        <div className="rivto-block-drop-wrapper-content">{children}</div>
        <BlockDropWrapperBoundary placement="after" axis={axis} />
      </BlockItem>
    );
  },
);
