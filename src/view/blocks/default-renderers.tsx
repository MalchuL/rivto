import { createElement, type ReactNode } from "react";
import type { BlockRenderProps, BlockRenderer } from "./types";
import { RIVTO_BLOCK_ATTR } from "./dom";
import { BlockRendererRegistry } from "../managers/block-renderer-registry";
import type { SurfaceType } from "../editor/types";

const DEFAULT_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "heading2",
  "heading3",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "quote",
  "code",
  "divider",
  "image",
  "file",
] as const;

function tagFor(type: string): keyof React.JSX.IntrinsicElements {
  switch (type) {
    case "heading":
      return "h1";
    case "heading2":
      return "h2";
    case "heading3":
      return "h3";
    case "quote":
      return "blockquote";
    case "code":
      return "pre";
    case "divider":
      return "hr";
    case "bulletListItem":
    case "numberedListItem":
      return "li";
    default:
      return "p";
  }
}

function DefaultBlockRenderer({ block, content }: BlockRenderProps): ReactNode {
  if (block.type === "divider") {
    return createElement("div", { [RIVTO_BLOCK_ATTR]: block.id }, createElement("hr"), content);
  }

  const tag = tagFor(block.type);
  const text = block.type === "file" || block.type === "image"
    ? block.content || String(block.props.title ?? block.type)
    : block.content;

  return createElement(
    "div",
    { [RIVTO_BLOCK_ATTR]: block.id },
    createElement(tag, null, text),
    content,
  );
}

function renderer(blockType: string, surface: SurfaceType): BlockRenderer {
  return {
    blockType,
    surface,
    component: DefaultBlockRenderer,
  };
}

/** Creates a block renderer registry for Rivto's built-in block definitions. */
export function createDefaultBlockRendererRegistry(): BlockRendererRegistry {
  const registry = new BlockRendererRegistry();
  for (const blockType of DEFAULT_BLOCK_TYPES) {
    registry.register(renderer(blockType, "block"));
    registry.register(renderer(blockType, "edgeless"));
  }
  return registry;
}
