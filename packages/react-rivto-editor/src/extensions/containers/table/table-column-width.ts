import type { ReactPanelApi } from "../../../panels/types";
import { TABLE_BLOCK_TYPE } from "./table-behavior";

/** Default persisted column width in CSS pixels. */
export const TABLE_DEFAULT_COLUMN_WIDTH = 180;
/** Minimum supported column width in CSS pixels. */
export const MIN_COLUMN_WIDTH = 80;
/** Maximum supported column width in CSS pixels. */
export const MAX_COLUMN_WIDTH = 1200;
/** Width variable shared by Page placements and retained Edgeless shells. */
export const COLUMN_WIDTH_PROPERTY = "--rivto-table-column-width";
/** Mounted Page cell placement carrying the column width. */
export const CELL_ITEM_ATTRIBUTE = "data-table-cell-item";

/** Addressed reads and grouped writes borrowed by column width commands. */
export interface TableColumnHost {
  readonly blocks: Pick<ReactPanelApi["blocks"], "getBlockNode" | "updateBlocks">;
}

/**
 * Converts persisted or requested width data to a safe CSS pixel value.
 *
 * @param value - Untrusted block property or caller value.
 * @returns Finite width clamped to the supported editor range.
 */
export function columnWidth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, value))
    : TABLE_DEFAULT_COLUMN_WIDTH;
}

/**
 * Resolves every existing cell at one column index.
 *
 * @param blocks - Addressed block reads borrowed without mutation or lifecycle capabilities.
 * @param tableId - Candidate table block ID.
 * @param column - Zero-based column index.
 * @returns Current cell IDs in row order, or an empty list for invalid input.
 */
export function tableColumnCells(
  blocks: Pick<TableColumnHost["blocks"], "getBlockNode">,
  tableId: string,
  column: number,
): string[] {
  const table = blocks.getBlockNode(tableId);
  return table?.type === TABLE_BLOCK_TYPE && Number.isInteger(column) && column >= 0
    ? table.childIds.flatMap((rowId) => {
        const cellId = blocks.getBlockNode(rowId)?.childIds[column];
        return cellId ? [cellId] : [];
      })
    : [];
}

/**
 * Persists one pixel width across every cell at a table column index.
 *
 * @param reactPanel - Existing panel narrowed to addressed reads and grouped width writes.
 * @param tableId - Table whose column should change.
 * @param column - Zero-based column index.
 * @param width - Requested width in CSS pixels.
 * @returns Whether a valid table column was updated.
 * @throws Propagates grouped block-command failures without swallowing model validation.
 */
export function setTableColumnWidth(
  reactPanel: TableColumnHost,
  tableId: string,
  column: number,
  width: number,
): boolean {
  const cells = tableColumnCells(reactPanel.blocks, tableId, column);
  if (cells.length === 0 || !Number.isFinite(width)) {
    return false;
  }
  const tableColumnWidth = columnWidth(width);
  reactPanel.blocks.updateBlocks(
    cells.map((id) => ({
      id,
      patch: { props: { tableColumnWidth } },
    })),
  );
  return true;
}
