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
export * from "./editor-view/editor-view";
export {
  EditorRuntime,
  createEditorRuntime,
} from "./editor/editor-runtime";
export { EditorStorageContext } from "./editor/editor-storage-context";
export { type BlockElementProps } from "./elements/block-element-projection";
export { pageDragExtension } from "./extensions/block-drag";
export type { PageDragOptions } from "./extensions/block-drag";
export {
  blockExtension,
  defaultWritingBlockExtension,
  standardPreset,
} from "./extensions/built-ins/built-ins";
export type { SlashMenuPositionOptions, StandardPresetOptions } from "./extensions/built-ins/built-ins";
export {
  ERROR_BLOCK_TYPE,
  ErrorBlock,
  createErrorBlockInput,
  errorBlockExtension,
} from "./extensions/built-ins/error/error-block";
export {
  DEFAULT_WRITING_BLOCK_TYPE,
  createIsEmptyDefaultBlock,
  resolveIsEmptyBlock,
} from "./extensions/built-ins/page/default-writing-block";
export type {
  CreateDefaultBlock,
  DefaultWritingBlockOptions,
  EmptyBlockCandidate,
  IsEmptyBlock,
} from "./extensions/built-ins/page/default-writing-block";
export {
  BLOCK_LIST_TYPES,
  DEFAULT_BLOCK_LIST_PROPS,
  isNumberedListType,
  resolveBlockListNumbers,
  type BlockListType,
} from "./extensions/built-ins/page/list";
export type { EdgelessSelectionSnapshot } from "./extensions/built-ins/selection/edgeless-runtime";
export {
  SEPARATOR_BLOCK_TYPE,
  SeparatorBlock,
  separatorBlockExtension,
} from "./extensions/built-ins/separator/separator-block";
export { bulletThreadingExtension } from "./extensions/bullet-threading/bullet-threading";
export type { BulletThreadingAnchor, BulletThreadingOptions } from "./extensions/bullet-threading/bullet-threading";
export {
  EdgelessVisualsExtension,
  edgelessPreset,
  edgelessSurfaceExtension,
  edgelessVisualsExtension,
} from "./extensions/edgeless";
export type { EdgelessPresetOptions } from "./extensions/edgeless";
export {
  EdgelessSnappingStore,
} from "./extensions/edgeless/surface";
export type {
  EdgelessSnappingSnapshot,
  EdgelessSurfaceOptions,
} from "./extensions/edgeless/surface";
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
  EdgelessVisualsOptions,
  OrphanConnectorBehavior,
  StickerVisual,
  UpdateVisualPayload,
  VisualFrame,
  VisualGroup,
} from "./extensions/edgeless/visuals";
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
  BLOCK_FLOW_SLOT_POSITIONS,
  BUILTIN_KEYMAP,
  KEYBOARD_BINDING_IDS,
  SLOT_POSITIONS,
  parseShortcut,
  readEditorDOMSelection,
  restoreEditorDOMSelection,
  shortcutFromKeyboardEvent,
} from "./managers";
export type {
  BlockContainment,
  BlockRenderer,
  BlockSlotPosition,
  BlockSlotProps,
  BlockSlotRegistration,
  ClipboardFormatContext,
  ClipboardFormatter,
  ClipboardParser,
  DOMEventDefinition,
  DOMEventName,
  DOMEventScope,
  DOMEventTarget,
  EditorEventHandler,
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
  ViewPasteStrategy,
} from "./managers";
export type {
  CreateEditorRuntimeOptions,
  MarkdownLinkClick,
} from "./types";
export { isEditorViewApi, isRivtoEditor } from "./utils";

export {
  KANBAN_BLOCK_TYPE,
  KANBAN_COLUMN_BLOCK_TYPE,
  Kanban,
  createKanbanBlockInput,
  kanbanExtension,
} from "./extensions/containers/kanban/kanban";

export { ContainerBlockBehavior, DefaultBlockBehavior } from "./block-behaviors/index";
export type {
  BlockBehavior,
  BlockBehaviorContext,
  BlockBehaviorOutcome,
  BlockDropContext,
  BlockDropDestination,
  BlockDropPlacementOptions,
  DropAxis,
} from "./block-behaviors/index";
export { BlockModal, BlockModalButton } from "./blocks/block-modal/block-modal";
export { BENTO_BLOCK_TYPE, Bento, bentoExtension, createBentoBlockInput } from "./extensions/containers/bento/bento";
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

export { EMBEDDING_BLOCK_TYPE, embeddingExtension, type EmbeddingProps } from "./extensions/embedding/embedding";

export { EdgelessSurface } from "./extensions/edgeless/surface/edgeless-surface";
export { PageSurface } from "./surfaces/page/page-surface";
export { SurfaceContext } from "./surfaces/surface";

export * from "./editor/editor-storage";

export type { EditorViewApi } from "./types";
