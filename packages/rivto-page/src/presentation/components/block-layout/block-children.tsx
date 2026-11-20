import type { BlockChildrenProps } from "./types";
import { useBlockLayoutInputRef } from "./browser/use-block-layout-input-ref";
import { useBlockEditorController } from "../../hooks/use-block-editor-controller";
import { BlockDropLayoutContext, useBlockDropLayout } from "../../drag-and-drop/block-drop-layout";
import { forwardRef, useContext } from "react";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import { useBlockChildrenState } from "./block-layout-context";
import { BlockList } from "./block-list";
import { BlockChildrenControlsContext } from "./block-item-context";
import { useBlockRegion } from "./use-block-region";
import type { RegionIdentity } from "@chulane/rivto-root";

export type { BlockChildrenProps } from "./types";

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
 * @param props.dropGutterSize - Distance beyond all four item edges in local CSS pixels, respecting viewport scaling. Zero leaves gutters for background regions; row (the default) fills the host. Item edges and physical gaps retain their actions.
 * @param props.dropEndGaps - Whether full-row linear lists extend endpoint boundaries through all remaining end space; defaults to true. False preserves measured edge continuation and row gutters while leaving farther end space to background declarations.
 * @param props.dropBackground - Enables append on unoccupied host background, including filtered lists.
 * @param props.dropAxis - Flow for declared regions, default vertical. Linear lists register inset edges without forcing indentation; grid items supply wrapping boundaries. Background padding has no implicit action.
 * @param props.targetSize - Optional edge thickness shared by direct items and descendants, including wrapping items; changes hit geometry only. The existing style token takes precedence.
 * @param props.dropPlacement - Outline declares horizontal depth regions; siblings fixes each gap to this list, independently of axis.
 * @param props.dropScope - Local (default) declares a self-contained child layout whose owner's outer edges sort siblings. Outline continues ordinary outline nesting through that owner; neither mode disables body drops or nesting between children.
 * @param props.hoverBoundary - True bounds descendant row hover to this layout; false inherits the enclosing area without changing indentation or drop permission.
 * @param props.renderEmpty - False omits the entire host when childIds is empty, including extra controls.
 * @param props.className - Additional classes, including optional outline indentation.
 * @param props.bindInput - Optional normalized input setup for this child host's mounted identity.
 * @param ref - Optional ref receiving this child host's opaque identity; callback cleanup is retained.
 * @returns The owner-local child group, empty or hidden when appropriate.
 * @throws If outside a block layout or a child/placement component fails.
 */
export const BlockChildren = forwardRef<RegionIdentity, BlockChildrenProps>(function BlockChildren(
  {
    item,
    bindInput,
    controlsPlacement,
    children,
    className,
    style,
    renderEmpty = true,
    emptyDropTarget = false,
    dropGaps,
    dropGutterSize,
    dropEndGaps,
    dropBoundaries,
    dropBackground = false,
    dropAxis = "vertical",
    targetSize,
    dropPlacement = "outline",
    dropScope = "local",
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
      gutterSize: dropGutterSize,
      endGaps: dropEndGaps,
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
  const { events } = useBlockEditorController();
  const inputRef = useBlockLayoutInputRef(dropLayout.ref, events, bindInput);
  const inheritedControls = useContext(BlockChildrenControlsContext);
  if (!renderEmpty && childIds.length === 0) {
    return null;
  }
  const host = (
    <div
      {...attributes}
      ref={inputRef}
      id={childrenId}
      data-block-drop-axis={dropAxis}
      data-block-drop-placement={dropPlacement}
      data-block-drop-scope={dropScope}
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
