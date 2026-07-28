import type { EditorBlock, EditorBlockInput } from "@chulane/rivto";

/** Converts a detached subtree into creation input with every persisted ID removed. */
export function duplicateBlockInput(block: EditorBlock): EditorBlockInput {
  return {
    type: block.type,
    collapsed: block.collapsed,
    content: block.content,
    props: structuredClone(block.props),
    pluginData: structuredClone(block.pluginData),
    layout: block.layout ? { ...block.layout } : undefined,
    children: block.children.map(duplicateBlockInput),
  };
}
