import type { BlockDropBoundaryMode } from "../../../editor/drag-and-drop/types";
import { BlockDropLayoutContext, useBlockDropLayout } from "../../drag-and-drop/block-drop-layout";
import {
  forwardRef,
  useContext,
  type ComponentType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import { useBlockChildrenState } from "./block-layout-context";
import { BlockList, type BlockChildrenItemProps } from "./block-list";
import { BlockChildrenControlsContext } from "./block-item-context";
import { useBlockRegion } from "./use-block-region";
import type { BlockEditorTheme } from "../../block-editor-theme";

/** Child host geometry and optional layout-owned item/control composition. */
export interface BlockChildrenProps extends HTMLAttributes<HTMLDivElement> {
  /** Native styles and the existing shared geometry/theme tokens. */
  readonly style?: BlockEditorTheme;
  readonly item?: ComponentType<BlockChildrenItemProps>;
  /** Left-top control placement inherited by child rows and descendants; omission inherits the enclosing layout. An explicit BlockItem placement takes precedence for its own row. */
  readonly controlsPlacement?: "inside" | "outside";
  /** Whether to retain the host for an empty child list; defaults to true for custom drop regions. */
  readonly renderEmpty?: boolean;
  /** Register the retained empty child host as an inside destination; defaults to false. */
  readonly emptyDropTarget?: boolean;
  /** Enable declared physical gaps independently of item edges; grid defaults to false. */
  readonly dropGaps?: boolean;
  /** Continue boundary actions across free row gutters; defaults to true when gaps are enabled. */
  readonly dropGutters?: boolean;
  /** Matching sibling feedback; omission inherits the editor default. */
  readonly dropBoundaries?: BlockDropBoundaryMode;
  /** Append on unoccupied background, including filtered lists; defaults to false. */
  readonly dropBackground?: boolean;
  /** Whether this host bounds row hover; defaults to true. Outline layouts opt into inherited width. */
  readonly hoverBoundary?: boolean;
  /** Flow for declared insertion regions; defaults to vertical, grid items own their placement edges. */
  readonly dropAxis?: "vertical" | "horizontal" | "grid";
  /** Inherited inset edge thickness in local CSS pixels; omission preserves the theme token. */
  readonly targetSize?: number;
  /** Outline declares depth bands; siblings keeps each region at this parent. Defaults to outline. */
  readonly dropPlacement?: "outline" | "siblings";
  /** Optional non-block JSX appended after mapped children, such as an add-column button. */
  readonly children?: ReactNode;
}

/**
 * Places actual child blocks with shared identity, collapse, and addressed subscriptions.
 *
 * The host is retained while collapsed, but descendants and their subscriptions
 * unmount. Empty groups remain available for layout-owned controls and drop areas;
 * package spacing applies only when the group has content. No indentation is forced.
 * The memoized list compares childIds and item identities before mapping nodes.
 *
 * @param props - Native host attributes and optional item components and region policies.
 * @param props.item - Stable host wrapper for each already-rendered child.
 * @param props.controlsPlacement - Placement inherited by this child subtree; omission preserves the enclosing layout, and explicit item placement overrides only its own row.
 * @param props.children - Extra non-block JSX after the data children, hidden on collapse.
 * @param props.emptyDropTarget - True registers the empty, expanded host as a destination for its actual owner.
 * @param props.dropBoundaries - Merged midpoint or separate edge feedback; omission inherits the view default.
 * @param props.dropGaps - Enables insertion in physical free gaps; false leaves those gaps neutral.
 * @param props.dropGutters - False keeps free row gutters for declared background regions; defaults to true. Item edges and physical gaps retain their actions.
 * @param props.dropBackground - Enables append on unoccupied host background, including filtered lists.
 * @param props.dropAxis - Flow for declared regions, default vertical. Linear lists register inset edges without forcing indentation; grid items supply wrapping boundaries. Background padding has no implicit action.
 * @param props.targetSize - Optional edge thickness shared by direct items and descendants, including wrapping items; changes hit geometry only. The existing style token takes precedence.
 * @param props.dropPlacement - Outline declares horizontal depth regions; siblings fixes each gap to this list, independently of axis.
 * @param props.hoverBoundary - True bounds descendant row hover to this layout; false inherits the enclosing area without changing indentation or drop permission.
 * @param props.renderEmpty - False omits the entire host when childIds is empty, including extra controls.
 * @param props.className - Additional classes, including optional outline indentation.
 * @param ref - Optional reference to this occurrence's child host.
 * @returns The owner-local child group, empty or hidden when appropriate.
 * @throws If outside a block layout or a child/placement component fails.
 */
export const BlockChildren = forwardRef<HTMLDivElement, BlockChildrenProps>(function BlockChildren(
  {
    item,
    controlsPlacement,
    children,
    className,
    style,
    renderEmpty = true,
    emptyDropTarget = false,
    dropGaps,
    dropGutters,
    dropBoundaries,
    dropBackground = false,
    dropAxis = "vertical",
    targetSize,
    dropPlacement = "outline",
    hoverBoundary = true,
    ...attributes
  },
  ref,
) {
  const { blockId, childIds, childrenId, collapsed } = useBlockChildrenState();
  const childrenRef = useBlockRegion(blockId, "children", ref);
  const dropLayout = useBlockDropLayout(
    {
      axis: dropAxis,
      boundaries: dropBoundaries,
      gaps: !collapsed && (dropGaps ?? dropAxis !== "grid"),
      gutters: dropGutters,
      order: childIds,
      regions:
        !collapsed && (dropBackground || (emptyDropTarget && childIds.length === 0))
          ? [
              {
                kind: "inside",
                coverage: "background",
                destination: { kind: "inside", parentId: blockId },
              },
            ]
          : [],
    },
    childrenRef,
  );
  const inheritedControls = useContext(BlockChildrenControlsContext);
  if (!renderEmpty && childIds.length === 0) {
    return null;
  }
  const host = (
    <div
      {...attributes}
      ref={dropLayout.ref}
      id={childrenId}
      data-block-drop-axis={dropAxis}
      data-block-drop-placement={dropPlacement}
      data-block-hover-boundary={hoverBoundary || undefined}
      style={{
        ...(targetSize === undefined
          ? undefined
          : { "--rivto-drop-target-size": `${targetSize}px` }),
        ...style,
        ...(collapsed ? { display: "none" } : undefined),
      }}
      className={[BLOCK_EDITOR_CLASSES.children, className].filter(Boolean).join(" ")}
      hidden={collapsed}
    >
      <BlockDropLayoutContext.Provider value={dropLayout.items}>
        {!collapsed && (
          <BlockChildrenControlsContext.Provider value={controlsPlacement ?? inheritedControls}>
            <BlockList
              blockIds={childIds}
              parentId={blockId}
              item={item}
              dropAxis={dropAxis}
              dropPlacement={dropPlacement}
            />
            {children}
          </BlockChildrenControlsContext.Provider>
        )}
      </BlockDropLayoutContext.Provider>
    </div>
  );
  return host;
});
