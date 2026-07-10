import { createElement, type CSSProperties, type ReactNode } from "react";
import type { EditorBlock } from "../../editor/model";
import type { Surface, SurfaceRenderProps } from "./types";

const DEFAULT_LAYOUT = { x: 0, y: 0, width: 320, height: 120, zIndex: 0 };

function renderBlock(block: EditorBlock, props: SurfaceRenderProps): ReactNode {
  const renderer = props.renderers.get(block.type, "edgeless");
  const content = renderer
    ? createElement(renderer.component, {
        block,
        editor: props.editor,
        surface: "edgeless",
        content: block.children.map((child) => renderBlock(child, props)),
      })
    : props.fallback?.(block) ?? null;

  if (!content) return null;

  const layout = { ...DEFAULT_LAYOUT, ...block.layout };
  const style: CSSProperties = {
    position: "absolute",
    left: layout.x,
    top: layout.y,
    width: layout.width,
    minHeight: layout.height,
    zIndex: layout.zIndex,
  };

  return createElement("div", { key: block.id, style }, content);
}

/** Renders root blocks on a positioned edgeless canvas. */
export function EdgelessSurface(props: SurfaceRenderProps): ReactNode {
  return createElement(
    "div",
    {
      "data-rivto-surface-content": "edgeless",
      style: { position: "relative", width: "100%", height: "100%" },
    },
    props.editor.getBlocks().map((block) => renderBlock(block, props)),
  );
}

/** Default edgeless-mode surface definition. */
export const edgelessSurface: Surface = {
  type: "edgeless",
  component: EdgelessSurface,
};
