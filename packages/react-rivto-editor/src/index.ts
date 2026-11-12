export { BLOCK_TEXT_METADATA_KEY } from "./managers/selection/block-text-metadata";
/**
 * Primary public API for `@chulane/rivto-react`.
 *
 * This entry point exposes normal editor setup, rendering, hooks, and selected
 * built-ins. Applications assembling a custom preset can import the complete
 * individual extension catalog from `@chulane/rivto-react/extensions`.
 *
 * @module
 */
export * from "./blocks";
export { MarkdownContent } from "./blocks/markdown/markdown";
export * from "./capabilities";
export * from "./components";
export * from "./constants";
export { EditorStorageContext } from "./editor/editor-storage-context";
export { ReactEditor, createReactEditor } from "./editor/react-editor";
export type { BlockElementProps } from "./elements/types";
export { pageDragExtension } from "./extensions/block-drag";
export { BlockResizeHandles } from "./extensions/containers/block-resize/block-resize-handles";
export type { BlockResizeHandlesProps } from "./extensions/containers/block-resize/block-resize-handles";
export type { BlockResizeEdge } from "./extensions/containers/block-resize/block-resize-controller";
export type { PageDragOptions } from "./extensions/block-drag";
export {
  blockExtension,
  defaultWritingBlockExtension,
  standardPreset,
} from "./extensions/built-ins/built-ins";
export type {
  SlashMenuPositionOptions,
  StandardPresetOptions,
} from "./extensions/built-ins/built-ins";
export {
  ERROR_BLOCK_TYPE,
  ErrorBlock,
  createErrorBlockInput,
  errorBlockExtension,
} from "./extensions/built-ins/error/error-block";
export { DEFAULT_WRITING_BLOCK_TYPE } from "./extensions/built-ins/page/default-writing-block";
export type { DefaultWritingBlockOptions } from "./extensions/built-ins/page/default-writing-block";
export {
  createBlockFactory,
  paragraphBlockFactory,
  separatorBlockFactory,
} from "./block-factories";
export type { BlockFactory } from "./block-factories";
export {
  BLOCK_LIST_TYPES,
  DEFAULT_BLOCK_LIST_PROPS,
  isNumberedListType,
  resolveBlockListNumbers,
  type BlockListType,
} from "./extensions/built-ins/page/list";
export type { EdgelessSelectionSnapshot } from "./extensions/built-ins/selection/types";
export {
  SEPARATOR_BLOCK_TYPE,
  SeparatorBlock,
  separatorBlockExtension,
} from "./extensions/built-ins/separator/separator-block";
export { bulletThreadingExtension } from "./extensions/bullet-threading/bullet-threading";
export { nestingLinesExtension } from "./extensions/nesting-lines/nesting-lines";
export type {
  BulletThreadingAnchor,
  BulletThreadingOptions,
} from "./extensions/bullet-threading/bullet-threading";
export {
  edgelessPreset,
  edgelessSurfaceExtension,
  edgelessVisualsExtension,
} from "./extensions/edgeless";
export { useEdgelessElementStyle } from "./hooks/elements/use-edgeless-element-style";
export type { EdgelessPresetOptions } from "./extensions/edgeless";
export { EdgelessSnappingStore } from "./surfaces/edgeless";
export type { EdgelessSnappingSnapshot, EdgelessSurfaceOptions } from "./surfaces/edgeless";
export type {
  ConnectorEndpoint,
  ConnectorEndpointStyle,
  ConnectorLineStyle,
  ConnectorRoute,
  ConnectorTextRotation,
  ConnectorVisual,
  CreateVisualPayload,
  EdgelessAlignment,
  EdgelessBrush,
  EdgelessFontOption,
  EdgelessReorder,
  EdgelessSelectionRef,
  EdgelessStickerOption,
  EdgelessVisual,
  EdgelessVisualCommandMap,
  OrphanConnectorBehavior,
  StickerVisual,
  UpdateVisualPayload,
  VisualFrame,
  VisualGroup,
} from "./elements/visuals/types";
export type { EdgelessVisualsOptions } from "./extensions/edgeless/visuals/types";
export {
  DefaultTodoItemPropertiesModal,
  TODO_ITEM_BLOCK_TYPE,
  TODO_STORAGE_BLOCK_TYPE,
  TodoItem,
  TodoStorage,
  todoItemExtension,
} from "./extensions/todo-item/todo-item";
export type {
  TodoItemBlock,
  TodoItemComponentProps,
  TodoItemExtensionOptions,
  TodoItemPropertiesModalProps,
  TodoItemPropertiesPatch,
  TodoItemProps,
  TodoItemStatus,
  TodoStorageComponentProps,
  TodoStorageOrderMode,
  TodoStorageProps,
} from "./extensions/todo-item/todo-item";
export * from "./hooks";
export {
  readEditorDOMSelection,
  restoreEditorDOMSelection,
} from "./panels/managers/selection/panel-dom-selection";
export {
  BLOCK_FLOW_SLOT_POSITIONS,
  BUILTIN_KEYMAP,
  KEYBOARD_BINDING_IDS,
  SLOT_POSITIONS,
  parseShortcut,
  shortcutFromKeyboardEvent,
} from "./managers";
export type {
  BlockClipboardConverter,
  BlockClipboardFields,
  BlockRenderer,
  BlockSlotPosition,
  BlockSlotProps,
  BlockSlotRegistration,
  ClipboardBinaryRepresentation,
  ClipboardContent,
  ClipboardCopyContext,
  ClipboardPostprocessContext,
  ClipboardPostprocessor,
  ClipboardWriteInput,
  ClipboardWriter,
  ClipboardFormatContext,
  ClipboardFormatter,
  ClipboardParseContext,
  ClipboardParser,
  ClipboardPasteContext,
  DOMEventDefinition,
  DOMEventName,
  DOMEventScope,
  DOMEventTarget,
  EditorEventHandler,
  ElementClipboardConverter,
  ElementClipboardFields,
  ElementClipboardFormatContext,
  ElementSlotProps,
  ElementSlotRegistration,
  ExtensionMountPosition,
  KeyboardBindingSnapshot,
  KeyboardEventDefinition,
  KeyboardShortcut,
  KeymapOverrides,
  PortableBlockFormats,
  ReactBlockDefinition,
  ReactBlockDefinitionMetadata,
  ReactBlockRegistration,
  ReactBlockSlashCommand,
  ReactEditorExtension,
  SlashCommand,
  SlashCommandContext,
  SlotPosition,
  SurfaceComponent,
  PanelPasteStrategy,
} from "./managers";
export type { CreateReactEditorOptions, MarkdownLinkClick } from "./types";
export { isRivtoEditor } from "./utils";
export { isReactPanelApi } from "./panels/is-react-panel-api";

export {
  KANBAN_BLOCK_TYPE,
  KANBAN_COLUMN_BLOCK_TYPE,
  Kanban,
  createKanbanBlockInput,
  kanbanExtension,
} from "./extensions/containers/kanban/kanban";

export { ContainerBlockBehavior, DefaultBlockBehavior } from "./block-behaviors";
export type {
  BlockBehavior,
  BlockBehaviorContext,
  BlockBehaviorData,
  BlockBehaviorOutcome,
} from "./block-behaviors";
export { BlockModal, BlockModalButton } from "./blocks/block-modal/block-modal";
export {
  BENTO_BLOCK_TYPE,
  Bento,
  bentoExtension,
  createBentoBlockInput,
} from "./extensions/containers/bento/bento";
export {
  COLUMNS_BLOCK_TYPE,
  COLUMNS_COLUMN_BLOCK_TYPE,
  COLUMNS_DEFAULT_COUNT,
  COLUMNS_MAX_COUNT,
  COLUMNS_MIN_COUNT,
  Columns,
  columnsExtension,
  createColumnsBlockInput,
  relocateColumnContents,
  setColumnsCount,
} from "./extensions/containers/columns/columns";
export {
  TABLE_BLOCK_TYPE,
  TABLE_CELL_BLOCK_TYPE,
  TABLE_DEFAULT_COLUMN_WIDTH,
  TABLE_ROW_BLOCK_TYPE,
  Table,
  createTableBlockInput,
  setTableColumnWidth,
  tableExtension,
  type TableCellProps,
} from "./extensions/containers/table/table";

export {
  EMBEDDING_BLOCK_TYPE,
  embeddingExtension,
  type EmbeddingProps,
} from "./extensions/embedding/embedding";

export { EdgelessSurface } from "./surfaces/edgeless/edgeless-surface";
export { PageSurface } from "./surfaces/page/page-surface";
export { SurfaceContext } from "./surfaces/surface";

export * from "./editor/editor-storage";

export { EditorPanel } from "./panels/editor-panel/editor-panel";
export type { EditorPanelProps } from "./panels/editor-panel/types";
export type { AttachmentApi } from "./attachments/api";
export type { ClipboardApi } from "./managers/clipboard/api";
export type { PanelDestination } from "@chulane/rivto";
export type { EditorStorageOptions, EditorAcquisition, ReactEditorApi } from "./editor/types";
export { useReactEditor } from "./hooks/editor/use-react-editor";
export type { ReactEditorState, UseReactEditorOptions } from "./hooks/editor/types";
export type { ReactPanelApi } from "./types";

export { EditorEmbed } from "./panels/editor-embed/editor-embed";
export type { EditorEmbedProps } from "./panels/editor-embed/types";

export type {
  CreateElementInput,
  ElementTypesApi,
  ReactElementRegistration,
  ElementRenderProps,
  ElementPropertiesProps,
} from "./managers/elements/types";
export type { PanelAPI } from "@chulane/rivto";
export type { EdgelessAPI } from "./managers/elements/types";

export { useEdgelessOperations } from "./hooks/elements/use-edgeless-operations";

export type {
  EdgelessToolbarApi,
  EdgelessToolbarEntry,
  EdgelessToolbarGroup,
  EdgelessToolbarTool,
  EdgelessToolbarContext,
  EdgelessToolbarRenderContext,
  EdgelessToolbarGroupProps,
  EdgelessToolbarItem,
} from "./managers/edgeless-toolbar/types";
export { EdgelessToolButton } from "./components/edgeless/tool-button";
export type { EdgelessToolButtonProps, EdgelessToolIcon } from "./components/edgeless/tool-button";

export {
  BlockHandle,
  BlockHandleContext,
  type BlockHandleOptions,
} from "./components/block-handle/block-handle";
export { blockHandleExtension } from "./extensions/built-ins/block-handle/extension";
export type {
  BlockContextMenuContext,
  BlockContextMenuRenderContext,
  BlockContextMenuEntry,
} from "./managers/block-context-menu/types";

export type {
  RememberedElementProperties,
  ElementCreationDefaults,
  CreationDefaultsScope,
} from "./managers/elements/creation-defaults-types";

export { EdgelessTool } from "./managers/edgeless-tools/edgeless-tool";
export type {
  EdgelessToolOptions,
  EdgelessToolPointer,
} from "./managers/edgeless-tools/edgeless-tool";
export { EdgelessCreationTool } from "./managers/edgeless-tools/edgeless-creation-tool";
export type {
  EdgelessCreationToolOptions,
  EdgelessCreationPlacement,
} from "./managers/edgeless-tools/edgeless-creation-tool";
export {
  VISUAL_TOOL_IDS,
  VISUAL_TOOL_GROUPS,
  VISUAL_ELEMENT_TYPES,
} from "./elements/visuals/constants";
export { EdgelessToolGroup } from "./managers/edgeless-tools/edgeless-tool-group";
export { EdgelessToolContext } from "./managers/edgeless-tools/edgeless-tool-context";
export { useEdgelessTools } from "./surfaces/edgeless/edgeless-tools-context";

export { RegisteredSurface } from "./surfaces/registered-surface";
export type { RegisteredSurfaceProps } from "./surfaces/registered-surface";

export * from "./extensions/file";
export * from "./extensions/image";
export * from "./attachments";

export { transferBlocksBetweenDocuments } from "./block-transfer/cross-document-block-transfer";
export type {
  BlockTransferPanel,
  CrossDocumentBlockTransferPlacement,
} from "./block-transfer/types";

export { htmlSurfaceExtension } from "./extensions/html-surface/extension";
export { HTML_BLOCK_TYPE, HTML_ELEMENT_TYPE } from "./extensions/html-surface/protocol/protocol";
