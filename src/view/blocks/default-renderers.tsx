import { createElement, type MouseEvent, type ReactNode } from "react";
import type { BlockRenderProps, BlockRenderer } from "./types";
import { RIVTO_BLOCK_ATTR, RIVTO_BLOCK_CONTENT_ATTR, RIVTO_SELECTED_ATTR } from "./dom";
import { BlockRendererRegistry } from "../managers/block-renderer-registry";
import type { SurfaceType } from "../editor/types";
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

function DefaultBlockRenderer({ block, editor, content }: BlockRenderProps): ReactNode {
  const selection = editor.selection.get();
  const selected = selection ? selection.type !== "text" && selection.blockIds.includes(block.id) : false;
  const attrs = {
    [RIVTO_BLOCK_ATTR]: block.id,
    [RIVTO_SELECTED_ATTR]: selected ? "true" : undefined,
    onClick(event: MouseEvent) {
      const target = typeof Element === "undefined" || !(event.target instanceof Element) ? null : event.target;
      if (target?.closest(`[${RIVTO_BLOCK_CONTENT_ATTR}]`)) return;
      event.stopPropagation();
      editor.execute("selection.set", {
        selection: {
          type: "block",
          blockIds: [block.id],
          anchorBlockId: block.id,
          focusBlockId: block.id,
        },
      });
    },
  };

  if (block.type === "divider") {
    return createElement("div", attrs, createElement("hr"), content);
  }

  const tag = tagFor(block.type);
  const text = block.type === "file" || block.type === "image"
    ? block.content || String(block.props.title ?? block.type)
    : block.content;
  const editable = isEditable(block.type);
  const contentAttrs = editable ? useBlockTextEditing({ block, editor, text }) : undefined;

  return createElement(
    "div",
    attrs,
    createElement(tag, contentAttrs, editable ? undefined : text),
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
