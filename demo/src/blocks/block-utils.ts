import type {
  EditorBlock as Block,
  EditorBlockInput as BlockInput,
} from "@chulane/rivto";

/** Converts a detached subtree into creation input with every persisted ID removed. */
export function duplicateBlockInput(block: Block): BlockInput {
  return {
    type: block.type,
    collapsed: block.collapsed,
    listProps: structuredClone(block.listProps),
    content: block.content,
    props: structuredClone(block.props),
    pluginData: structuredClone(block.pluginData),
    layout: block.layout ? { ...block.layout } : undefined,
    children: block.children.map(duplicateBlockInput),
  };
}
