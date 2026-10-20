/**
 * Autonomous block presentation contracts, controller, component, and limited hooks.
 *
 * The current rendering slice borrows a bounded adapter and does not install
 * concrete block types, host integration, text input, slots, or drag-and-drop.
 *
 * @module
 */
export type {
  BlockEditorAdapter,
  BlockEditorBlocks,
  BlockEditorNode,
  BlockEditorRegion,
  BlockEditorRegionSnapshot,
  BlockEditorRenderers,
  BlockEditorSelection,
  BlockRenderer,
  BlockRendererProps,
} from "./adapter/types";
export {
  BlockEditor,
  type BlockEditorProps,
} from "./presentation/components/block-editor/block-editor";
export { BlockEditorController } from "./editor/block-editor-controller";
export { useBlockNode } from "./presentation/hooks/use-block-node";
export { useBlockEditorController } from "./presentation/hooks/use-block-editor-controller";
