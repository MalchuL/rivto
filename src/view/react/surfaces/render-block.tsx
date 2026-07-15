import { createElement, type ReactNode } from "react";
import type { EditorBlock } from "../../../editor/model";
import type { SurfaceRenderProps, SurfaceType } from "../editor/types";
import { BlockShell } from "../blocks/block-shell";

/**
 * Renders one generic block shell for the active surface.
 *
 * Surfaces decide placement. The shell owns DOM markers, selection state, and
 * child traversal, then asks the registered block renderer for content only.
 */
export function renderBlockShell(block: EditorBlock, props: SurfaceRenderProps, surface: SurfaceType): ReactNode {
  const selection = props.editor.selection.get();
  const selected = selection ? selection.type !== "text" && selection.blockIds.includes(block.id) : false;
  return createElement(BlockShell, {
    key: block.id,
    block,
    editor: props.editor,
    surface,
    renderProps: props,
    selected,
  });
}

/** Returns detached blocks in visible tree order. */
export function flattenBlocks(blocks: EditorBlock[]): EditorBlock[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}
