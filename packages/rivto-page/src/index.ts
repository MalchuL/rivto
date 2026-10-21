/**
 * Autonomous block presentation contracts, controller, component, and limited hooks.
 *
 * The current rendering slice borrows a bounded adapter and does not install
 * concrete block types, host integration, text input or drag-and-drop. Structural slots are registered separately.
 *
 * @module
 */
export type {
  BlockEditorAdapter,
  BlockEditorBlocks,
  BlockEditorNodePatch,
  BlockEditorNodeSnapshot,
  BlockEditorSelection,
  BlockListType,
} from "./adapter/types";
export {
  BlockEditor,
  type BlockEditorProps,
} from "./presentation/components/block-editor/block-editor";
export { BlockEditorNode } from "./editor/blocks/block-editor-node";
export { BlockEditorController, type BlockEditorOptions } from "./editor/block-editor-controller";
export { useBlockNode } from "./presentation/hooks/use-block-node";
export { useBlockEditorController } from "./presentation/hooks/use-block-editor-controller";

export { BlockView, type BlockViewProps } from "./presentation/components/block-layout/block-view";
export { BLOCK_EDITOR_CLASSES } from "./presentation/block-editor-classes";
export { BlockListSlot, BlockCollapseSlot } from "./presentation/slots/block-controls";
export {
  SLOT_POSITIONS,
  type BlockSlotPosition,
  type BlockSlotProps,
  type BlockSlotRegistration,
  type BlockSlotEntry,
} from "./presentation/slots/types";

export {
  BlockEditorThemeProvider,
  type BlockEditorTheme,
  type BlockEditorThemeProviderProps,
} from "./presentation/block-editor-theme";

export type { BlockRenderer, BlockRendererProps } from "./presentation/renderers/types";
export type { BlockEditorExtension, BlockEditorExtensionsApi } from "./editor/extensions/types";
export type {
  BlockEditorEventType,
  BlockEditorEventsApi,
} from "./editor/events/block-editor-events";

export type {
  BlockLayout,
  BlockLayoutProps,
  BlockRendererRegistration,
} from "./presentation/renderers/types";
export { DefaultBlockLayout } from "./presentation/components/block-layout/default-block-layout";
export { BlockRow, type BlockRowProps } from "./presentation/components/block-layout/block-row";
export { BlockContent } from "./presentation/components/block-layout/block-content";
export { BlockBody } from "./presentation/components/block-layout/block-body";
export {
  BlockChildren,
  type BlockChildrenProps,
} from "./presentation/components/block-layout/block-children";
export { BlockItem, type BlockItemProps } from "./presentation/components/block-layout/block-item";
export type {
  BlockChildrenItemProps,
  BlockChildrenGapProps,
} from "./presentation/components/block-layout/block-list";
export {
  BlockDropTarget,
  type BlockDropTargetProps,
} from "./presentation/drag-and-drop/block-drop-target";
export type {
  BlockDropDestination,
  InsideBlockDropDestination,
  BetweenBlockDropDestination,
  BlockDropTargetRegistration,
  ResolvedBlockDropTarget,
  BlockDropTargetsApi,
} from "./editor/drag-and-drop/types";

export { BlockDropGap, type BlockDropGapProps } from "./presentation/drag-and-drop/block-drop-gap";

export type { BlockEditorApi } from "./editor/block-editor-api";

export type { BlockEditorNodeApi } from "./editor/blocks/block-editor-node-api";

export {
  BlockDropWrapper,
  type BlockDropWrapperProps,
} from "./presentation/drag-and-drop/block-drop-wrapper";

export { BlockWrapper } from "./presentation/components/block-wrapper/block-wrapper";
export type {
  BlockWrapperProps,
  BlockWrapperComponent,
  BlockWrapperEntry,
  BlockWrapperRegistration,
  BlockWrapperRegistryApi,
} from "./presentation/components/block-wrapper/types";
