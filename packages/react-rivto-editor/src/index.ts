export * from "./blocks";
export * from "./capabilities";
export * from "./components";
export * from "./constants";
export * from "./editor-view";
export * from "./hooks";
export {
  blockExtension,
  edgelessSurfaceExtension,
  standardPreset,
} from "./extensions/built-ins/built-ins";
export type { StandardPresetOptions } from "./extensions/built-ins/built-ins";
export {
  DEFAULT_WRITING_BLOCK_TYPE,
  defaultWritingBlockExtension,
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
export { type BlockElementProps } from "./surfaces/edgeless";
export {
  EdgelessSnappingStore,
} from "./surfaces/edgeless";
export type { EdgelessSelectionSnapshot } from "./extensions/built-ins/edgeless/edgeless-runtime";
export type {
  EdgelessSnappingSnapshot,
  EdgelessSurfaceOptions,
} from "./surfaces/edgeless";
export {
  EdgelessVisualsExtension,
  edgelessVisualsExtension,
} from "./extensions/built-ins/edgeless/visuals";
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
} from "./extensions/built-ins/edgeless/visuals";
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
} from "./extensions/built-ins/kanban/kanban";

export { Bento, bentoExtension, createBentoBlockInput, BENTO_BLOCK_TYPE } from "./extensions/built-ins/bento/bento";
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
} from "./extensions/built-ins/columns/columns";
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
} from "./extensions/built-ins/table/table";
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
