import { forwardRef, useContext, type ReactNode, type HTMLAttributes } from "react";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import { BlockChildrenControlsContext, BlockItemControlsContext } from "./block-item-context";
import { BlockSlots } from "../../slots/block-slots";
import { useBlockLayoutState } from "./block-layout-context";
import { useBlockRegion } from "./use-block-region";
import type { BlockEditorTheme } from "../../block-editor-theme";

/** Native row attributes and interior JSX, including an independently placed BlockContent. */
export interface BlockRowProps extends HTMLAttributes<HTMLDivElement> {
  /** Native styles and the existing shared geometry/theme tokens. */
  readonly style?: BlockEditorTheme;
  /** Automatic contributions by default; manual layouts place BlockSlot explicitly. */
  readonly slots?: "automatic" | "manual";
  /** JSX contents arranged by the owning layout; no recursive traversal is performed here. */
  readonly children?: ReactNode;
}

/**
 * Positions inline and perimeter contributions around the supplied row contents.
 *
 * Placement belongs to the layout; a layout may omit the row entirely. Package
 * spacing and the start gutter work without renderer or demo stylesheet overrides.
 * An explicit BlockItem placement moves only its matching row's left-top controls;
 * an ancestor item's placement does not alter descendant rows.
 * Child layouts may separately choose an inherited placement for their subtree;
 * an explicit matching item's placement takes precedence over that default.
 *
 * @param props - Native row attributes and content placed between its inline slots.
 * @param props.children - JSX arranged by the host layout.
 * @param props.slots - Automatic mounts inline/perimeter contributions; manual renders only supplied JSX.
 * @param props.className - Additional classes appended to the stable row hook.
 * @param ref - Optional reference to this row's actual DOM element.
 * @returns One row with its owner-bound slot contributions.
 * @throws If outside a block layout or a contribution fails to render.
 */
export const BlockRow = forwardRef<HTMLDivElement, BlockRowProps>(function BlockRow(
  { children, className, slots = "automatic", ...attributes },
  ref,
) {
  const layoutState = useBlockLayoutState();
  const rowRef = useBlockRegion(layoutState.block.id, "row", ref);
  const controls = useContext(BlockItemControlsContext);
  const inheritedControls = useContext(BlockChildrenControlsContext);
  const placement =
    controls?.blockId === layoutState.block.id ? controls.placement : inheritedControls;
  return (
    <div
      {...attributes}
      ref={rowRef}
      data-controls-placement={placement}
      className={[BLOCK_EDITOR_CLASSES.row, className].filter(Boolean).join(" ")}
    >
      {slots === "automatic" ? <BlockSlots {...layoutState}>{children}</BlockSlots> : children}
    </div>
  );
});
