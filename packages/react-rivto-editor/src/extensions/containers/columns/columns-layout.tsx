import {
  BlockBody,
  BlockItem,
  type BlockChildrenItemProps,
  BlockDropTarget,
  BlockChildren,
  BlockContent,
  BlockRow,
  type BlockLayoutProps,
} from "@chulane/rivto-page";
import { useLayoutEffect, useState, type RefCallback } from "react";
import { useBlockNode } from "../../../hooks/blocks/use-block";

/** Minimum lane width excluding the container's own inline padding. */
const MIN_COLUMN_CONTENT_WIDTH = 112;

/** Current child-host ref and its matching placement axis. */
interface ColumnsAxisState {
  /** Registers the child host whose width determines lane layout. */
  readonly ref: RefCallback<HTMLDivElement>;
  /** Axis used by both the layout and Page's drop regions. */
  readonly axis: "vertical" | "horizontal";
}

/**
 * Observes available lane width and keeps the drop axis aligned with lane flow.
 *
 * The observer belongs to the mounted child host and is released on replacement
 * or unmount. Widths are measured in local pixels, independent of canvas zoom.
 *
 * @param count - Current number of direct child lanes.
 * @returns Child-host ref and the axis appropriate for its available width.
 */
function useColumnsAxis(count: number): ColumnsAxisState {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [axis, setAxis] = useState<"vertical" | "horizontal">("horizontal");
  useLayoutEffect(() => {
    if (!host) {
      return;
    }
    /**
     * Reconciles lane flow with the host's current local content width.
     *
     * @param width - Child-host content width in local CSS pixels.
     * @returns Updates the drop axis when the available width changes its layout.
     */
    const updateAxis = (width: number) => {
      const style = host.ownerDocument.defaultView?.getComputedStyle(host);
      if (!style) {
        return;
      }
      const gap = parseFloat(style.columnGap) || 0;
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const minimumLaneWidth = MIN_COLUMN_CONTENT_WIDTH + padding;
      setAxis(
        count > 1 && width < count * minimumLaneWidth + (count - 1) * gap
          ? "vertical"
          : "horizontal",
      );
    };
    const style = host.ownerDocument.defaultView?.getComputedStyle(host);
    let observedWidth = style
      ? host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      : 0;
    updateAxis(observedWidth);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(([entry]) => {
            const width = entry?.contentRect.width;
            if (width !== undefined && width !== observedWidth) {
              observedWidth = width;
              updateAxis(width);
            }
          });
    observer?.observe(host);
    return () => observer?.disconnect();
  }, [host, count]);
  return { ref: setHost, axis };
}

/**
 * Composes a management row and equal-width, headerless content lanes.
 *
 * The preference belongs to the child host: dividers occupy the real gaps,
 * not either column's content or selection area. Page traverses each lane once.
 * The lanes stack when the available width cannot accommodate their controls;
 * the registered drop axis follows the displayed flow.
 *
 * @param props - Board identity supplied by Page.
 * @param props.blockId - Board whose divider preference and children are observed.
 * @returns Management row, body contributions and one responsive child group.
 */
export function ColumnsLayout({ blockId }: BlockLayoutProps) {
  const { block } = useBlockNode(blockId);
  const { ref, axis } = useColumnsAxis(block?.childIds.length ?? 0);
  return (
    <>
      <BlockRow
        className="rivto-columns-header"
        data-collapsed={block?.listProps.collapsed === true}
      >
        <BlockContent />
      </BlockRow>
      <BlockBody />
      <BlockChildren
        ref={ref}
        className="rivto-columns-children"
        item={ColumnBlockItem}
        dropAxis={axis}
        dropPlacement="siblings"
        emptyDropTarget
        data-show-dividers={block?.props.showDividers !== false}
      />
    </>
  );
}

/**
 * Places one column child with its controls inside the available lane width.
 *
 * @param props - Existing child subtree supplied by Page.
 * @param props.children - Child shell rendered once without changing its layout.
 * @returns A placement item reserving row space for the child's controls.
 */
function ColumnBlockItem({ children }: BlockChildrenItemProps) {
  return <BlockItem controlsPlacement="inside">{children}</BlockItem>;
}

/**
 * Gives empty and collapsed lanes a control row alongside their ordinary children.
 *
 * Expanded populated lanes omit their own row and its controls, leaving the first
 * writing block reachable without a separate structural header above its content.
 * Empty lanes use the registered writing control; collapse restores the summary row
 * and hides the canonical child host, rather than moving descendants into a renderer.
 * The addressed snapshot observes both child count and collapse changes, including
 * deletion of the last child and expansion of a previously saved collapsed lane.
 *
 * @param props - Lane identity supplied by Page.
 * @param props.blockId - Receiving parent for header and empty-region drops.
 * @returns The lane's controls, body contributions and its single child list.
 */
export function ColumnsColumnLayout({ blockId }: BlockLayoutProps) {
  const { block } = useBlockNode(blockId);
  const showRow = block?.listProps.collapsed === true || block?.childIds.length === 0;
  return (
    <>
      {showRow && (
        <BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }}>
          <BlockRow className="rivto-columns-lane-header">
            <BlockContent />
          </BlockRow>
        </BlockDropTarget>
      )}
      <BlockBody />
      <BlockChildren
        className="rivto-columns-content"
        dropAxis="vertical"
        dropPlacement="outline"
        renderEmpty={false}
      />
    </>
  );
}
