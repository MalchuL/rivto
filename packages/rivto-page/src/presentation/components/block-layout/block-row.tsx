import { forwardRef, type ReactNode, type HTMLAttributes } from "react";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import { BlockSlots } from "../../slots/block-slots";
import { useBlockLayoutState } from "./block-layout-context";

/** Native row attributes and interior JSX, including an independently placed BlockContent. */
export interface BlockRowProps extends HTMLAttributes<HTMLDivElement> {
  /** JSX contents arranged by the owning layout; no recursive traversal is performed here. */
  readonly children?: ReactNode;
}

/**
 * Positions inline and perimeter contributions around the supplied row contents.
 *
 * Placement belongs to the layout; a layout may omit the row entirely. Package
 * spacing and the start gutter work without renderer or demo stylesheet overrides.
 *
 * @param props - Native row attributes and content placed between its inline slots.
 * @param props.children - JSX arranged by the host layout.
 * @param props.className - Additional classes appended to the stable row hook.
 * @param ref - Optional reference to this row's actual DOM element.
 * @returns One row with its owner-bound slot contributions.
 * @throws If outside a block layout or a contribution fails to render.
 */
export const BlockRow = forwardRef<HTMLDivElement, BlockRowProps>(function BlockRow(
  { children, className, ...attributes },
  ref,
) {
  const layoutState = useBlockLayoutState();
  return (
    <div
      {...attributes}
      ref={ref}
      className={[BLOCK_EDITOR_CLASSES.row, className].filter(Boolean).join(" ")}
    >
      <BlockSlots {...layoutState}>{children}</BlockSlots>
    </div>
  );
});
