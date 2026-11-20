import { BlockItemIdentityContext } from "./block-item-context";
import { forwardRef, useContext } from "react";
import type { RegionIdentity } from "@chulane/rivto-root";
import { BlockEditorContext } from "../block-editor/block-editor-context";
import { useBlockViewRef } from "./browser/use-block-view-ref";
import type { BlockViewProps } from "./types";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import type { BlockEditorTheme } from "../../block-editor-theme";

export type { BlockViewProps } from "./types";

/**
 * Renders a stable block DOM boundary without subscribing or choosing a renderer.
 *
 * Identity, type, list, background, and selection attributes are controlled by this
 * component. Ordinary presentation attributes and an opaque identity ref can be supplied for host integration.
 * The explicit ref belongs to its caller; decorators own identities for their own elements.
 * A region identity identifies the shell, not its mounting occurrence; browser
 * operations must use the current Root and respect its attachment lifetime.
 * An enclosing BlockItem owns the sibling counter, including items added by decorators.
 * The snapshot is read-only; document mutations remain with the adapter's host.
 * Each shell receives its resolved CSS background directly from the host snapshot.
 * Page does not interpret palette names or define a color-token protocol. The public
 * background override remains separate from the node's supplied color value;
 * theme overrides inherit, while a parent's own background does not color children.
 * Selection supplies an inherited background fill to the shell and child layouts.
 * The fill replaces their backgrounds without blending text or persisted colors;
 * removing selection restores each surface's own background through CSS fallbacks.
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
 * @param props.bindInput - Optional normalized input setup for this mounted shell.
 * @param ref - Optional ref receiving the shell's opaque identity; object refs clear on unmount and callback cleanup is retained.
 * @returns A div whose stable data attributes cannot be overridden by other props.
 * @throws If input is bound outside a BlockEditor, or binding, ref forwarding, or cleanup fails.
 */
export const BlockView = forwardRef<RegionIdentity, BlockViewProps>(function BlockView(
  { block, selected = false, className, children, style, bindInput, ...attributes },
  ref,
) {
  const itemId = useContext(BlockItemIdentityContext);
  const editor = useContext(BlockEditorContext);
  const shellRef = useBlockViewRef(ref, editor?.events, bindInput);
  const blockStyle: BlockEditorTheme = {
    backgroundColor: `var(--rivto-block-selection-fill, var(--rivto-block-background, ${block.color || "var(--rivto-background, #fff)"}))`,
    ...style,
  };
  return (
    <div
      {...attributes}
      ref={shellRef}
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
