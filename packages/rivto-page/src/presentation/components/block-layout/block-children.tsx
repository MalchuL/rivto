import { BlockDropTarget } from "../../drag-and-drop/block-drop-target";
import {
  forwardRef,
  useContext,
  type ComponentType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import { useBlockChildrenState } from "./block-layout-context";
import { BlockList, type BlockChildrenItemProps, type BlockChildrenGapProps } from "./block-list";
import { BlockChildrenControlsContext } from "./block-item-context";
import { useBlockRegion } from "./use-block-region";
import type { BlockEditorTheme } from "../../block-editor-theme";

/** Child host geometry and optional layout-owned item/gap/control composition. */
export interface BlockChildrenProps extends HTMLAttributes<HTMLDivElement> {
  /** Native styles and the existing shared geometry/theme tokens. */
  readonly style?: BlockEditorTheme;
  readonly item?: ComponentType<BlockChildrenItemProps>;
  readonly gap?: ComponentType<BlockChildrenGapProps>;
  /** Left-top control placement inherited by child rows and descendants; omission inherits the enclosing layout. An explicit BlockItem placement takes precedence for its own row. */
  readonly controlsPlacement?: "inside" | "outside";
  /** Whether to retain the host for an empty child list; defaults to true for custom drop regions. */
  readonly renderEmpty?: boolean;
  /** Register the retained empty child host as an inside destination; defaults to false. */
  readonly emptyDropTarget?: boolean;
  /** Whether this host bounds row hover; defaults to true. Outline layouts opt into inherited width. */
  readonly hoverBoundary?: boolean;
  /** Layout axis for background drops; vertical lists reuse default outline depth placement. */
  readonly dropAxis?: "vertical" | "horizontal" | "grid";
  /** Outline permits depth projection; siblings keeps background gaps at this parent. Defaults to outline. */
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
 * The memoized list compares childIds, item, and gap identities before mapping nodes.
 *
 * @param props - Native host attributes and optional item/gap components.
 * @param props.item - Stable host wrapper for each already-rendered child.
 * @param props.gap - Stable component receiving each gap's current canonical neighbors.
 * @param props.controlsPlacement - Placement inherited by this child subtree; omission preserves the enclosing layout, and explicit item placement overrides only its own row.
 * @param props.children - Extra non-block JSX after the data children, hidden on collapse.
 * @param props.emptyDropTarget - True registers the empty, expanded host as a destination for its actual owner.
 * @param props.dropAxis - Explicit container flow for background drops. Vertical lists use default outline depth placement without forcing indentation; horizontal and grid lists retain their layout geometry. Omission retains existing outline and registered-region targeting.
 * @param props.dropPlacement - Outline preserves horizontal depth selection; siblings fixes background insertion to this list, independently of axis.
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
    gap,
    controlsPlacement,
    children,
    className,
    style,
    renderEmpty = true,
    emptyDropTarget = false,
    dropAxis,
    dropPlacement = "outline",
    hoverBoundary = true,
    ...attributes
  },
  ref,
) {
  const { blockId, childIds, childrenId, collapsed } = useBlockChildrenState();
  const childrenRef = useBlockRegion(blockId, "children", ref);
  const inheritedControls = useContext(BlockChildrenControlsContext);
  if (!renderEmpty && childIds.length === 0) {
    return null;
  }
  const host = (
    <div
      {...attributes}
      ref={childrenRef}
      id={childrenId}
      data-block-drop-axis={dropAxis}
      data-block-drop-placement={dropPlacement}
      data-block-hover-boundary={hoverBoundary || undefined}
      style={collapsed ? { ...style, display: "none" } : style}
      className={[BLOCK_EDITOR_CLASSES.children, className].filter(Boolean).join(" ")}
      hidden={collapsed}
    >
      {!collapsed && (
        <BlockChildrenControlsContext.Provider value={controlsPlacement ?? inheritedControls}>
          <BlockList blockIds={childIds} parentId={blockId} item={item} gap={gap} />
          {children}
        </BlockChildrenControlsContext.Provider>
      )}
    </div>
  );
  if (emptyDropTarget && !collapsed && childIds.length === 0) {
    return (
      <BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }}>
        {host}
      </BlockDropTarget>
    );
  }
  return host;
});
