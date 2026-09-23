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
export * from "./capabilities";
export * from "./components";
export * from "./constants";
export * from "./editor-view";
export * from "./hooks";
export {
  blockExtension,
  defaultWritingBlockExtension,
  standardPreset,
} from "./extensions/built-ins/built-ins";
export type { CollapseExtensionOptions, StandardPresetOptions } from "./extensions/built-ins/built-ins";
export { pageDragExtension } from "./extensions/block-drag";
export type { PageDragOptions } from "./extensions/block-drag";
export {
  edgelessPreset,
  edgelessSurfaceExtension,
} from "./extensions/edgeless";
export type { EdgelessPresetOptions } from "./extensions/edgeless";
export {
  DEFAULT_WRITING_BLOCK_TYPE,
} from "./extensions/built-ins/page/default-writing-block";
export type {
  DefaultWritingBlockOptions,
} from "./extensions/built-ins/page/default-writing-block";
export {
  SEPARATOR_BLOCK_TYPE,
  SeparatorBlock,
  separatorBlockExtension,
} from "./extensions/built-ins/separator/separator-block";
export {
  TODO_ITEM_BLOCK_TYPE,
  TODO_STORAGE_BLOCK_TYPE,
  DefaultTodoItemPropertiesModal,
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
export {
  createReactEditor,
} from "./react-editor";
export type {
  CreateReactEditorOptions,
  MarkdownLinkClick,
  ReactEditor,
} from "./types";
export {
  createIsEmptyDefaultBlock,
  resolveIsEmptyBlock,
} from "./extensions/built-ins/page/default-writing-block";
export type {
  CreateDefaultBlock,
  EmptyBlockCandidate,
  IsEmptyBlock,
} from "./extensions/built-ins/page/default-writing-block";
export { MarkdownContent } from "./blocks/markdown";
export {
  ERROR_BLOCK_TYPE,
  ErrorBlock,
  createErrorBlockInput,
  errorBlockExtension,
} from "./extensions/built-ins/error/error-block";
export {
  BLOCK_LIST_TYPES,
  DEFAULT_BLOCK_LIST_PROPS,
  isNumberedListType,
  resolveBlockListNumbers,
  type BlockListType,
} from "./extensions/built-ins/page/list";
export { type BlockElementProps } from "./elements/block-element-projection";
export {
  EdgelessSnappingStore,
} from "./extensions/edgeless/surface";
export type { EdgelessSelectionSnapshot } from "./extensions/built-ins/selection/edgeless-runtime";
export type {
  EdgelessSnappingSnapshot,
  EdgelessSurfaceOptions,
} from "./extensions/edgeless/surface";
export {
  EdgelessVisualsExtension,
  edgelessVisualsExtension,
} from "./extensions/edgeless";
export type {
  CreateVisualPayload,
  ConnectorEndpoint,
  ConnectorEndpointStyle,
  ConnectorLineStyle,
  ConnectorRoute,
  ConnectorTextRotation,
  ConnectorVisual,
  EdgelessAlignment,
  EdgelessBrush,
  EdgelessFontOption,
  EdgelessReorder,
  EdgelessStickerOption,
  EdgelessSelectionRef,
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
  readEditorDOMSelection,
  restoreEditorDOMSelection,
  BUILTIN_KEYMAP,
  KEYBOARD_BINDING_IDS,
  parseShortcut,
  shortcutFromKeyboardEvent,
} from "./managers";
export type {
  BlockRenderer,
  BlockSlotProps,
  BlockSlotPosition,
  BlockSlotRegistration,
  ClipboardFormatContext,
  ClipboardFormatter,
  ClipboardParser,
  PortableBlockFormats,
  DOMEventDefinition,
  DOMEventName,
  DOMEventScope,
  DOMEventTarget,
  EditorEventHandler,
  ExtensionMountPosition,
  KeymapOverrides,
  KeyboardBindingSnapshot,
  KeyboardEventDefinition,
  KeyboardShortcut,
  ReactBlockRegistration,
  ReactBlockDefinition,
  ReactBlockDefinitionMetadata,
  BlockContainment,
  ReactBlockSlashCommand,
  ReactEditorExtension,
  ElementSlotProps,
  ElementSlotRegistration,
  SlashCommand,
  SlashCommandContext,
  SurfaceComponent,
  SlotPosition,
} from "./managers";
export { BLOCK_FLOW_SLOT_POSITIONS, SLOT_POSITIONS } from "./managers";

export {
  Kanban,
  kanbanExtension,
  createKanbanBlockInput,
  KANBAN_BLOCK_TYPE,
  KANBAN_COLUMN_BLOCK_TYPE,
} from "./extensions/containers/kanban/kanban";

export { Bento, bentoExtension, createBentoBlockInput, BENTO_BLOCK_TYPE } from "./extensions/containers/bento/bento";
export {
  Columns,
  columnsExtension,
  createColumnsBlockInput,
  relocateColumnContents,
  setColumnsCount,
  COLUMNS_BLOCK_TYPE,
  COLUMNS_COLUMN_BLOCK_TYPE,
  COLUMNS_DEFAULT_COUNT,
  COLUMNS_MIN_COUNT,
  COLUMNS_MAX_COUNT,
} from "./extensions/containers/columns/columns";
export {
  Table,
  tableExtension,
  createTableBlockInput,
  setTableColumnWidth,
  TABLE_BLOCK_TYPE,
  TABLE_ROW_BLOCK_TYPE,
  TABLE_CELL_BLOCK_TYPE,
  TABLE_DEFAULT_COLUMN_WIDTH,
  type TableCellProps,
} from "./extensions/containers/table/table";
export { BlockModal, BlockModalButton } from "./blocks/block-modal";
export { BaseBlockView, ContainerBlockView } from "./views";
export type {
  BlockViewBehavior,
  BlockDropPlacementOptions,
  BlockViewContext,
  BlockViewDropContext,
  BlockViewOutcome,
  DropAxis,
} from "./views";
