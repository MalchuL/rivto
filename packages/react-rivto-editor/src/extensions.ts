/**
 * Complete public extension catalog for `@chulane/rivto-react/extensions`.
 *
 * This secondary package entry point exposes standard built-ins plus optional
 * block-drag, edgeless, and container factories so applications can assemble
 * custom presets. The primary package entry keeps a smaller curated surface;
 * both entry points preserve the same underlying extension identities.
 *
 * @module
 */
export * from "./extensions/built-ins/built-ins";
export * from "./extensions/block-drag";
export * from "./extensions/edgeless";
export * from "./extensions/built-ins/separator/separator-block";
export {
  DEFAULT_WRITING_BLOCK_TYPE,
} from "./extensions/built-ins/page/default-writing-block";
export type {
  DefaultWritingBlockOptions,
} from "./extensions/built-ins/page/default-writing-block";
export type {
  ReactEditorExtension,
  ReactBlockRegistration,
  ReactBlockSlashCommand,
  SlashCommand,
  SlashCommandContext,
} from "./managers";

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
  BlockDropPlacementOptions,
  BlockViewBehavior,
  BlockViewContext,
  BlockViewDropContext,
  BlockViewOutcome,
  DropAxis,
} from "./views";
