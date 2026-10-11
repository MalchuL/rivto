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
export * from "./extensions/block-drag";
export * from "./extensions/built-ins/built-ins";
export {
  DEFAULT_WRITING_BLOCK_TYPE,
} from "./extensions/built-ins/page/default-writing-block";
export type {
  DefaultWritingBlockOptions,
} from "./extensions/built-ins/page/default-writing-block";
export * from "./extensions/built-ins/separator/separator-block";
export * from "./extensions/bullet-threading/bullet-threading";
export * from "./extensions/edgeless";
export * from "./extensions/todo-item/todo-item";
export type {
  ReactBlockRegistration,
  ReactBlockSlashCommand,
  ReactEditorExtension,
  SlashCommand,
  SlashCommandContext,
} from "./managers";

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
