import { createElement, type ReactNode } from "react";
import type { SurfaceType } from "../editor/types";
import { BlockRendererRegistry } from "../managers/block-renderer-registry";
import type { BlockRenderProps, BlockRenderer } from "./types";
import { useBlockTextEditing } from "./use-block-text-editing";

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

function isEditable(type: string): boolean {
  return !["divider", "image", "file"].includes(type);
}

/**
 * Default React renderer for built-in text-like blocks.
 *
 * Surfaces and BlockShell own layout, selection, handles, DOM block markers,
 * and child traversal. This renderer draws only the current block's content.
 */
function DefaultBlockRenderer({ block, editor }: BlockRenderProps): ReactNode {
  if (block.type === "divider") {
    return createElement("hr");
  }

  const tag = tagFor(block.type);
  const text = block.type === "file" || block.type === "image"
    ? block.content || String(block.props.title ?? block.type)
    : block.content;
  const editable = isEditable(block.type);
  const contentAttrs = editable ? useBlockTextEditing({ block, editor, text }) : undefined;

  return createElement(tag, contentAttrs, editable ? undefined : text);
}

function renderer(blockType: string, surface: SurfaceType): BlockRenderer {
  return {
    blockType,
    surface,
    component: DefaultBlockRenderer,
  };
}

/** Creates React block renderers for Rivto's built-in block definitions. */
export function createDefaultBlockRendererRegistry(): BlockRendererRegistry {
  const registry = new BlockRendererRegistry();
  for (const blockType of DEFAULT_BLOCK_TYPES) {
    registry.register(renderer(blockType, "block"));
    registry.register(renderer(blockType, "edgeless"));
  }
  return registry;
}
