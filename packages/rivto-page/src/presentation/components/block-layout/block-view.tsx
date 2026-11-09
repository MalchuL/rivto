import { BlockItemIdentityContext } from "./block-item-context";
import { forwardRef, useContext, type HTMLAttributes } from "react";
import type { BlockEditorNodeSnapshot } from "../../../adapter/types";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import type { BlockCssProperties } from "./block-css-properties";

/** Structural container inputs; layout contents are composed by the registered block layout. */
export interface BlockViewProps extends HTMLAttributes<HTMLDivElement> {
  /** Immutable own fields reflected in protected DOM attributes. */
  readonly block: BlockEditorNodeSnapshot;
  /** Whole-block selection; omitted/false removes the selection marker. */
  readonly selected?: boolean;
  /** Ordinary styles, common background override, and inherited layout/theme parameters. */
  readonly style?: BlockCssProperties;
}

/**
 * Renders a stable block DOM boundary without subscribing or choosing a renderer.
 *
 * Identity, type, list, background, and selection attributes are controlled by this
 * component. Ordinary attributes and a ref can be supplied for host DOM integration.
 * The explicit ref belongs to its caller; decorators own refs on their own elements.
 * An enclosing BlockItem owns the sibling counter, including items added by decorators.
 * The snapshot is read-only; document mutations remain with the adapter's host.
 * Each shell receives semantic appearance from the host snapshot and translates it
 * to CSS for rendering. Page does not interpret palette names or define a color-token
 * protocol. The public editor background override remains separate from the node's
 * own color; theme overrides inherit, while a parent's own style does not style children.
 * Selection supplies an inherited background fill to the shell and child layouts.
 * The fill replaces their backgrounds without blending text or persisted colors;
 * removing selection restores each surface's own background through CSS fallbacks.
 * Each shell resets its own background variable so child layouts can use the node's
 * color without inheriting a parent block's color or installing a theme subscription.
 * A layout may make its shell transparent when it owns the background paint, avoiding
 * duplicate compositing for translucent colors while retaining selection precedence.
 * The node's local style supplies its own background, text and border. Text rules
 * are scoped to this block's content; descendants retain their independent styles.
 * The selection fill and public background override retain their existing priority.
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
  const appearance = block.style;
  const background =
    typeof appearance?.background?.color === "string" ? appearance.background.color : undefined;
  const text = appearance?.text;
  const border = appearance?.border;
  const textColor = typeof text?.color === "string" ? text.color : undefined;
  const fontFamily = typeof text?.fontFamily === "string" ? text.fontFamily : undefined;
  const fontSize = typeof text?.fontSize === "string" ? text.fontSize : undefined;
  const fontWeight =
    typeof text?.fontWeight === "string" ||
    (typeof text?.fontWeight === "number" && Number.isFinite(text.fontWeight))
      ? text.fontWeight
      : undefined;
  const lineHeight = typeof text?.lineHeight === "string" ? text.lineHeight : undefined;
  const alignment = typeof text?.alignment === "string" ? text.alignment : undefined;
  const borderColor = typeof border?.color === "string" ? border.color : undefined;
  const borderWidth = typeof border?.width === "string" ? border.width : undefined;
  const borderStyle = typeof border?.style === "string" ? border.style : undefined;
  const borderRadius = typeof border?.radius === "string" ? border.radius : undefined;
  const blockStyle: BlockCssProperties = {
    borderColor,
    borderWidth: borderWidth ? blockStyleLength(borderWidth) : undefined,
    borderStyle,
    borderRadius: borderRadius ? blockStyleLength(borderRadius) : undefined,
    backgroundColor: `var(--rivto-block-selection-fill, var(--rivto-block-shell-background, var(--rivto-block-background, ${background || "var(--rivto-block-default-background, var(--rivto-background, #fff))"})))`,
    "--rivto-block-own-background": background ?? "initial",
    "--rivto-own-text-color": textColor,
    "--rivto-own-font-family": fontFamily,
    "--rivto-own-font-size": fontSize ? blockStyleLength(fontSize) : undefined,
    "--rivto-own-font-weight": fontWeight,
    "--rivto-own-line-height": lineHeight ? blockStyleLength(lineHeight) : undefined,
    "--rivto-own-text-alignment": alignment,
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
      data-block-background={background || undefined}
      data-block-text-color={textColor !== undefined || undefined}
      data-block-font-family={fontFamily !== undefined || undefined}
      data-block-font-size={fontSize !== undefined || undefined}
      data-block-font-weight={fontWeight !== undefined || undefined}
      data-block-line-height={lineHeight !== undefined || undefined}
      data-block-text-alignment={alignment !== undefined || undefined}
      data-block-selected={selected || undefined}
    >
      {children}
    </div>
  );
});

/**
 * Converts unitless block style lengths to CSS pixel lengths.
 *
 * @param value - Space-separated lengths with optional CSS units.
 * @returns CSS lengths with unitless numbers expressed in pixels.
 */
function blockStyleLength(value: string): string {
  return value.replace(/(^|\s)(-?(?:\d+\.?\d*|\.\d+))(?=\s|$)/g, "$1$2px");
}
