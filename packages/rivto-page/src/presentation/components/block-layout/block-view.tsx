import { BlockItemIdentityContext } from "./block-item-context";
import { forwardRef, useContext, type HTMLAttributes } from "react";
import type { BlockEditorNodeSnapshot } from "../../../adapter/types";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import type { BlockEditorTheme } from "../../block-editor-theme";

/** Structural container inputs; layout contents are composed by the registered block layout. */
export interface BlockViewProps extends HTMLAttributes<HTMLDivElement> {
  /** Immutable own fields reflected in protected DOM attributes. */
  readonly block: BlockEditorNodeSnapshot;
  /** Whole-block selection; omitted/false removes the selection marker. */
  readonly selected?: boolean;
  /** Ordinary styles, common background override, and inherited layout/theme parameters. */
  readonly style?: BlockEditorTheme;
}

/**
 * Renders a stable block DOM boundary without subscribing or choosing a renderer.
 *
 * Identity, type, list, background, and selection attributes are controlled by this
 * component. Ordinary attributes and a ref can be supplied for host DOM integration.
 * The explicit ref belongs to its caller; decorators own refs on their own elements.
 * An enclosing BlockItem owns the sibling counter, including items added by decorators.
 * The snapshot is read-only; document mutations remain with the adapter's host.
 * Each shell receives its resolved CSS background directly from the host snapshot.
 * Page does not interpret palette names or define a color-token protocol. The public
 * background override remains separate from the node's supplied color value;
 * theme overrides inherit, while a parent's own background does not color children.
 * Color selection sets the non-inherited backgroundColor property; it does not
 * mutate an inherited node-color variable or install a theme subscription.
 *
 * @param props - Snapshot, selection, children, and ordinary container attributes.
 * @param props.block - Own snapshot whose ID and presentation fields mark the shell.
 * @param props.selected - Whole-block selection; false by default.
 * @param props.className - Additional classes appended to the structural block class.
 * @param props.children - Composed layout regions, which may omit or reorder the row, body, and child host.
 * @param props.style - Styles and public theme parameters; explicit backgroundColor
 * overrides the resolved node background just like an ordinary inline style.
 * @param ref - Optional ref to the actual block div.
 * @returns A div whose stable data attributes cannot be overridden by other props.
 */
export const BlockView = forwardRef<HTMLDivElement, BlockViewProps>(function BlockView(
  { block, selected = false, className, children, style, ...attributes },
  ref,
) {
  const itemId = useContext(BlockItemIdentityContext);
  const blockStyle: BlockEditorTheme = {
    backgroundColor: `var(--rivto-block-background, ${block.color || "var(--rivto-background, #fff)"})`,
    ...style,
  };
  return (
    <div
      {...attributes}
      ref={ref}
      style={blockStyle}
      className={[BLOCK_EDITOR_CLASSES.block, className].filter(Boolean).join(" ")}
      data-block-in-item={itemId === block.id || undefined}
      data-block-id={block.id}
      data-block-type={block.type}
      data-block-list-type={block.listType}
      data-block-background={block.color || undefined}
      data-block-selected={selected || undefined}
    >
      {children}
    </div>
  );
});
