import { forwardRef, useContext, type ReactNode, type HTMLAttributes } from "react";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import { BlockItemControlsContext } from "./block-item-context";
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
 * Only a matching BlockItem identity can move this row's left-top controls inside;
 * ancestor placement does not alter descendant rows.
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
  const controls = useContext(BlockItemControlsContext);
  const placement = controls?.blockId === layoutState.block.id ? controls.placement : "outside";
  return (
    <div
      {...attributes}
      ref={ref}
      data-controls-placement={placement}
      className={[BLOCK_EDITOR_CLASSES.row, className].filter(Boolean).join(" ")}
    >
      <BlockSlots {...layoutState}>{children}</BlockSlots>
    </div>
  );
});
