import { forwardRef, type ComponentType, type HTMLAttributes, type ReactNode } from "react";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import { useBlockChildrenState } from "./block-layout-context";
import { BlockList, type BlockChildrenItemProps, type BlockChildrenGapProps } from "./block-list";

/** Child host geometry and optional layout-owned item/gap/control composition. */
export interface BlockChildrenProps extends HTMLAttributes<HTMLDivElement> {
  readonly item?: ComponentType<BlockChildrenItemProps>;
  readonly gap?: ComponentType<BlockChildrenGapProps>;
  /** Whether to retain the host for an empty child list; defaults to true for custom drop regions. */
  readonly renderEmpty?: boolean;
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
 * @param props.children - Extra non-block JSX after the data children, hidden on collapse.
 * @param props.renderEmpty - False omits the entire host when childIds is empty, including extra controls.
 * @param props.className - Additional classes, including optional outline indentation.
 * @param ref - Optional reference to this occurrence's child host.
 * @returns The owner-local child group, empty or hidden when appropriate.
 * @throws If outside a block layout or a child/placement component fails.
 */
export const BlockChildren = forwardRef<HTMLDivElement, BlockChildrenProps>(function BlockChildren(
  { item, gap, children, className, style, renderEmpty = true, ...attributes },
  ref,
) {
  const { blockId, childIds, childrenId, collapsed } = useBlockChildrenState();
  if (!renderEmpty && childIds.length === 0) {
    return null;
  }
  return (
    <div
      {...attributes}
      ref={ref}
      id={childrenId}
      style={collapsed ? { ...style, display: "none" } : style}
      className={[BLOCK_EDITOR_CLASSES.children, className].filter(Boolean).join(" ")}
      hidden={collapsed}
    >
      {!collapsed && (
        <>
          <BlockList blockIds={childIds} parentId={blockId} item={item} gap={gap} />
          {children}
        </>
      )}
    </div>
  );
});
