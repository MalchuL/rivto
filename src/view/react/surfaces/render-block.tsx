import { createElement, type ReactNode } from "react";
import type { EditorBlock } from "../../../editor/model";
import type { SurfaceRenderProps, SurfaceType } from "../editor/types";

/**
 * Renders one block through the registered renderer for the active surface.
 *
 * Surfaces call this helper while deciding placement and tree traversal. The
 * block renderer receives already-rendered child content and stays focused on
 * the block's own visual body.
 */
export function renderBlock(block: EditorBlock, props: SurfaceRenderProps, surface: SurfaceType): ReactNode {
  const renderer = props.renderers.get(block.type, surface);
  if (!renderer) return props.fallback?.(block) ?? null;
  return createElement(renderer.component, {
    key: block.id,
    block,
    editor: props.editor,
    surface,
    content: block.children.map((child) => renderBlock(child, props, surface)),
  });
}

/** Returns detached blocks in visible tree order. */
export function flattenBlocks(blocks: EditorBlock[]): EditorBlock[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}
