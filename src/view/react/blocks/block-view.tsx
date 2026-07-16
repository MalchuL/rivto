import { createElement, forwardRef, type HTMLAttributes, type ReactNode } from "react";
import type { EditorBlock } from "../../../editor/model";
import { useViewContext } from "../editor/context";
import { RIVTO_BLOCK_ATTR, RIVTO_SELECTED_ATTR } from "./dom";

export interface BlockViewProps extends HTMLAttributes<HTMLDivElement> {
  readonly block: EditorBlock;
  readonly selected?: boolean;
}

/** Stable block container. Surfaces own its content, recursion, and layout. */
export const BlockView = forwardRef<HTMLDivElement, BlockViewProps>(function BlockView(
  { block, selected, children, ...attributes },
  ref,
) {
  const { plugins } = useViewContext();
  const base = createElement("div", {
    ...attributes,
    ref,
    [RIVTO_BLOCK_ATTR]: block.id,
    "data-type": block.type,
    [RIVTO_SELECTED_ATTR]: selected ? "true" : undefined,
  }, children);
  return [...plugins].reverse().reduce<ReactNode>((child, plugin) => (
    plugin.Block ? createElement(plugin.Block, { block, children: child }) : child
  ), base);
});
