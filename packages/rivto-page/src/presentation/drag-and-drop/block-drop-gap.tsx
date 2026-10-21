import type { BlockChildrenGapProps } from "../components/block-layout/block-list";
import { BlockDropTarget } from "./block-drop-target";

/** Canonical gap with package-owned hit-area geometry along its parent's flow axis. */
export interface BlockDropGapProps extends BlockChildrenGapProps {
  /**
   * Direction in which sibling blocks are arranged, not the orientation of the gap strip.
   *
   * Defaults to vertical: blocks are stacked top to bottom, so their gap is a
   * horizontal strip. Horizontal means blocks are arranged left to right, so
   * their gap is a vertical strip:
   *
   * ```text
   * vertical flow:       horizontal flow:
   * [Block A]           [Block A] | [Block B]
   * --------- <- gap              ^ gap
   * [Block B]
   * ```
   *
   * This prop selects gap sizing only; the parent layout arranges the blocks.
   * It does not choose a destination, which is supplied by parentId and neighbors.
   * --rivto-drop-gap-size controls thickness (default 8px); horizontal flow also
   * uses --rivto-drop-min-height for the strip's minimum height (default 32px).
   */
  readonly axis?: "horizontal" | "vertical";
}

/**
 * Declares a sibling gap without inferring document structure from DOM positions.
 *
 * Geometry defaults belong to the package and are configurable with public CSS
 * parameters. A layout may instead use BlockDropTarget for any custom-shaped region.
 * This primitive occupies a real position in its parent's flow: a horizontal strip
 * between vertically stacked blocks, or a vertical strip between side-by-side blocks.
 * Grid and wrapping layouts instead compose BlockDropWrapper around each child so the
 * insertion boundaries do not become separate cells or flex items in the parent.
 * Those wrappers reserve space around content and follow resizing without overlays.
 * Empty containers can use a separate inside BlockDropTarget on their retained child
 * host. Targets remain registered independently of any inspector or drag gesture.
 *
 * @param props - Explicit canonical flow neighbors and optional flow direction.
 * @param props.parentId - Existing parent owning a flow gap.
 * @param props.previousId - Previous child of a flow gap, or null at the start.
 * @param props.nextId - Next child of a flow gap, or null at the end.
 * @param props.axis - Child flow axis; defaults to vertical (stacked blocks with a
 * horizontal gap strip). Horizontal flow uses a vertical strip between side-by-side blocks.
 * The owning layout, rather than this primitive, arranges the adjacent blocks.
 * @returns One in-flow hit area registered as a between destination.
 * @throws If outside BlockEditor or target registration fails.
 */
export function BlockDropGap(props: BlockDropGapProps) {
  const { parentId, previousId, nextId, axis = "vertical" } = props;
  return (
    <BlockDropTarget
      className="rivto-block-drop-gap"
      data-drop-axis={axis}
      data-drop-gap={parentId}
      destination={{ kind: "between", parentId, previousId, nextId }}
    />
  );
}
