import { createElement, type ReactNode } from "react";
import type { EditorBlock } from "../../editor/model";
import type { Surface, SurfaceRenderProps } from "./types";

function renderBlock(block: EditorBlock, props: SurfaceRenderProps): ReactNode {
  const renderer = props.renderers.get(block.type, "block");
  if (!renderer) return props.fallback?.(block) ?? null;
  return createElement(renderer.component, {
    key: block.id,
    block,
    editor: props.editor,
    surface: "block",
    content: block.children.map((child) => renderBlock(child, props)),
  });
}

/** Renders root blocks as a vertical document tree. */
export function BlockSurface(props: SurfaceRenderProps): ReactNode {
  return createElement(
    "div",
    { "data-rivto-surface-content": "block" },
    props.editor.getBlocks().map((block) => renderBlock(block, props)),
  );
}

/** Default block-mode surface definition. */
export const blockSurface: Surface = {
  type: "block",
  component: BlockSurface,
};
