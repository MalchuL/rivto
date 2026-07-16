import { createElement, forwardRef, type HTMLAttributes, type ReactNode } from "react";
import type { EditorBlock } from "../../../editor/model";
import { useViewContext } from "../editor/context";
import { RIVTO_BLOCK_ATTR, RIVTO_SELECTED_ATTR } from "./dom";

export interface BlockViewProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Detached editor-model value represented by this DOM container.
   *
   * `BlockView` reads only the stable identity and native type. It deliberately
   * does not inspect content, children, layout, or plugin data because the
   * active surface owns those presentation decisions.
   */
  readonly block: EditorBlock;

  /**
   * Whether the active surface considers this block selected.
   *
   * Selection policy differs between page and edgeless surfaces, so the
   * container receives the result instead of reading `editor.selection`
   * itself. When false or omitted, the selection DOM attribute is removed.
   */
  readonly selected?: boolean;
}

/**
 * Renders the framework-owned DOM boundary for one editor block.
 *
 * The container gives DOM-based features a stable contract independent of the
 * current surface or block renderer:
 *
 * - `data-rivto-block-id` connects DOM nodes to editor-model identities;
 * - `data-type` exposes the persisted native type for styling and inspection;
 * - `data-rivto-selected` exposes surface-computed selection state;
 * - the forwarded ref lets surface plugins measure or position the real block
 *   element without querying the whole document.
 *
 * Everything inside the boundary is supplied through `children`. A page
 * surface may render editable content followed by recursively nested blocks,
 * while an edgeless surface may render the same content in an absolutely
 * positioned plugin wrapper. Keeping those choices out of `BlockView` avoids
 * coupling the package to a renderer registry, tree layout, or drag library.
 *
 * Installed block plugins wrap the base container. This is the extension point
 * for behavior such as drag handles, sortable positioning, object frames, or
 * selection chrome. `BlockView` itself remains behavior-free.
 */
export const BlockView = forwardRef<HTMLDivElement, BlockViewProps>(function BlockView(
  { block, selected, children, ...attributes },
  ref,
) {
  const { plugins } = useViewContext();

  // Consumer attributes are applied first so the framework-owned identity and
  // selection markers below cannot be accidentally replaced. `children` are
  // already removed from `attributes` and remain wholly surface-owned.
  const base = createElement("div", {
    ...attributes,
    ref,
    [RIVTO_BLOCK_ATTR]: block.id,
    "data-type": block.type,
    [RIVTO_SELECTED_ATTR]: selected ? "true" : undefined,
  }, children);

  // Reducing the reversed list makes the first declared plugin the outermost
  // wrapper: [A, B] becomes <A><B>{base}</B></A>. EditorView uses the same
  // ordering for root wrappers, so plugin precedence is consistent at both
  // extension points. Copying before reverse preserves the caller's array.
  return [...plugins].reverse().reduce<ReactNode>((child, plugin) => (
    plugin.Block ? createElement(plugin.Block, { block, children: child }) : child
  ), base);
});
