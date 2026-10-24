/**
 * Autonomous block presentation contracts, controller, component, and limited hooks.
 *
 * The current rendering slice borrows a bounded adapter and does not install
 * concrete block types, host integration or text input. Selection and handle dragging
 * are optional extensions; structural slots are registered separately.
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
export { BlockSlot, type BlockSlotPlacementProps } from "./presentation/slots/block-slots";
export {
  BlockChildren,
  type BlockChildrenProps,
} from "./presentation/components/block-layout/block-children";
export { BlockItem, type BlockItemProps } from "./presentation/components/block-layout/block-item";
export type { BlockChildrenItemProps } from "./presentation/components/block-layout/block-list";
export {
  BlockDropTarget,
  type BlockDropTargetProps,
} from "./presentation/drag-and-drop/block-drop-target";
export {
  BlockDropExclude,
  type BlockDropExcludeProps,
} from "./presentation/drag-and-drop/block-drop-exclude";
export type {
  BlockDropDestination,
  BlockDropAcceptance,
  InsideBlockDropDestination,
  BetweenBlockDropDestination,
  BlockDropTargetRegistration,
  ResolvedBlockDropTarget,
  BlockDropIndicator,
  BlockDragTargetScope,
  BlockDropTargetsApi,
} from "./editor/drag-and-drop/types";

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

export { BlockInputEvent } from "./editor/events/block-input-event";
export type {
  BlockInputDefinition,
  BlockInputEventMap,
  BlockInputHandler,
  BlockInputObserver,
  BlockInputResult,
  BlockInputTarget,
  BlockInputScope,
} from "./editor/events/block-input-event";

export type { BlockKeyboardApi, BlockKeyboardDefinition } from "./editor/keyboard/block-keyboard";
export type { BlockKeyboardEvent } from "./editor/keyboard/block-keyboard-event";

export {
  BlockSelectionExtensions,
  type BlockSelectionBindings,
  type BlockSelectionFeature,
} from "./editor/selection/block-selection-extensions";
export type {
  BlockSelectionSnapshot,
  BlockSelectionRange,
  BlockSelectionPosition,
} from "./editor/selection/types";

export { BlockVirtualizationController } from "./editor/virtualization/block-virtualization-controller";
export type { BlockVirtualizationOptions } from "./editor/virtualization/block-virtualization-controller";

export {
  BlockDragExtension,
  type BlockDragAdapter,
  type BlockDragPreviewRow,
} from "./editor/drag-and-drop/block-drag-extension";
export { BlockDragHandle } from "./presentation/drag-and-drop/block-drag-handle";

export { BlockDropFeedback } from "./editor/drag-and-drop/block-drop-feedback";
export { EmbeddedEditorAcquisition } from "./editor/embedding/embedded-editor-acquisition";
export type {
  SourceEditorProvider,
  SourceEditorLease,
  EmbeddedEditorSnapshot,
} from "./editor/embedding/embedded-editor-acquisition";
export {
  DropSurfaceRegistry,
  DROP_SURFACE_ATTRIBUTE,
} from "./editor/drag-and-drop/drop-surface-registry";
export type { DropSurface } from "./editor/drag-and-drop/drop-surface-registry";
export { BlockAutoScroll } from "./editor/pointer/block-auto-scroll";
export type { BlockScrollPoint } from "./editor/pointer/block-auto-scroll";
export { BlockPointerOwnership } from "./editor/pointer/block-pointer-ownership";
export { DragHandle, type DragHandleProps } from "./presentation/drag-and-drop/drag-handle";

export { BlockDropReceiver } from "./editor/drag-and-drop/block-drop-receiver";
export {
  BlockDragRouter,
  type BlockForeignDropResolver,
} from "./editor/drag-and-drop/block-drag-router";

export {
  BlockEditorScope,
  type BlockEditorScopeProps,
  type BlockEditorViewApi,
} from "./presentation/components/block-editor/block-editor-scope";
export { BlockNode } from "./presentation/components/block-layout/block-node";

export { BlockDOMSelection, type DOMSelectionPoint } from "./editor/selection/block-dom-selection";
export { BlockSelectionEndpoints } from "./editor/selection/block-selection-endpoints";
export { BlockNavigation } from "./editor/blocks/block-navigation";

export {
  BlockRootNode,
  type BlockRootNodeProps,
} from "./presentation/drag-and-drop/block-root-node";

export {
  BlockDropLayout,
  type BlockDropLayoutProps,
  type BlockDropLayoutOptions,
} from "./presentation/drag-and-drop/block-drop-layout";
export type {
  BlockDropRegion,
  BlockDropEdgeRegion,
  BlockDropInsideRegion,
  BlockDropGapRegion,
  BlockDropDepth,
  BlockDropBoundaryMode,
  BlockDropLayoutRegistration,
  BlockDropPoint,
} from "./editor/drag-and-drop/types";

export {
  BlockEditorEnd,
  type BlockEditorEndProps,
} from "./presentation/components/block-editor/block-editor-end";
