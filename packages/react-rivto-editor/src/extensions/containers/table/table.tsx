/**
 * Optional table presentation built entirely from ordinary document blocks.
 * Tables own rows, rows own draggable cells, and cells retain editable Markdown
 * content plus arbitrary child blocks. Shared hierarchy, drag, clipboard,
 * snapshots, and undo behavior remain owned by the existing editor managers.
 * @module
 */
import { type EditorBlock, type EditorBlockInput } from "@chulane/rivto";
import { createPortal } from "react-dom";
import { PlusIcon } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { BlockElementRefProvider, type BlockWrapperProps } from "../../../blocks/block-wrapper";
import { BlockModal, BlockModalButton } from "../../../blocks/block-modal";
import { MarkdownContent } from "../../../blocks/markdown";
import { useBlockEditing, useReactEditor } from "../../../hooks";
import { type ReactEditorExtension } from "../../../managers";
import type { ReactEditor } from "../../../types";
import { tableCellView, tableRowView, tableView } from "./table-view";
import { convertLeafToContainer } from "../../../views/ops/outline-ops";

export const TABLE_BLOCK_TYPE = "table";
export const TABLE_ROW_BLOCK_TYPE = "table-row";
export const TABLE_CELL_BLOCK_TYPE = "table-cell";
export const TABLE_DEFAULT_COLUMN_WIDTH = 180;

const TABLE_CLASS = "rivto-table";
const TABLE_SUMMARY_CLASS = "rivto-table-summary flex items-center gap-2";
const TABLE_SUMMARY_STATS_CLASS = "text-xs tabular-nums text-muted-foreground";
const ROW_CLASS = "rivto-table-row";
const CELL_CLASS = "rivto-table-cell";
/** Placement and hover reveal live in table.css; the round badge look is utility-based. */
const BOUNDARY_BUTTON_CLASS = "size-[22px] rounded-full border-input bg-background text-primary shadow-sm hover:bg-background hover:text-primary [&_svg]:size-3.5";
const ADD_ROW_CLASS = "rivto-table-add-row";
const ADD_COLUMN_CLASS = "rivto-table-add-column";
const RESIZE_COLUMN_CLASS = "rivto-table-resize-column";
const COLUMN_WIDTH_PROPERTY = "--rivto-table-column-width";
const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 1200;

/** Persisted presentation properties owned by a table cell. */
export interface TableCellProps {
  /** Preferred column width in CSS pixels. */
  readonly tableColumnWidth?: number;
}


/**
 * Rejects dimensions that would create a malformed or unexpectedly huge grid.
 * @param value - Requested row or column count.
 * @param label - Dimension name used by the error.
 * @returns The accepted positive integer.
 */
function tableDimension(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`Table ${label} must be a positive integer`);
  return value;
}

/**
 * Converts persisted or requested width data to a safe CSS pixel value.
 * @param value - Untrusted block property or caller value.
 * @returns Finite width clamped to the supported editor range.
 */
function columnWidth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, value))
    : TABLE_DEFAULT_COLUMN_WIDTH;
}

/**
 * Creates one editable cell that may later own arbitrary child blocks.
 * @param width - Persisted preferred width in CSS pixels.
 * @returns Portable empty cell input.
 */
function createTableCellInput(width = TABLE_DEFAULT_COLUMN_WIDTH): EditorBlockInput {
  return { type: TABLE_CELL_BLOCK_TYPE, content: "", props: { tableColumnWidth: columnWidth(width) } };
}

/**
 * Creates one structural row with the requested number of cells.
 * @param widths - Pixel width for each cell in the row.
 * @returns Portable row subtree.
 */
function createTableRowInput(widths: readonly number[]): EditorBlockInput {
  return {
    type: TABLE_ROW_BLOCK_TYPE,
    content: "",
    children: widths.map((width) => createTableCellInput(width)),
  };
}

/**
 * Creates a rectangular table backed only by the ordinary block hierarchy.
 * @param rows - Initial row count; defaults to three.
 * @param columns - Initial column count; defaults to three.
 * @param width - Initial width of every column in CSS pixels; defaults to 180.
 * @returns Portable table subtree.
 */
export function createTableBlockInput(
  rows = 3,
  columns = 3,
  width = TABLE_DEFAULT_COLUMN_WIDTH,
): EditorBlockInput {
  const widths = Array.from({ length: tableDimension(columns, "column count") }, () => columnWidth(width));
  return {
    type: TABLE_BLOCK_TYPE,
    content: "",
    children: Array.from(
      { length: tableDimension(rows, "row count") },
      () => createTableRowInput(widths),
    ),
  };
}

/**
 * Locates the current BlockView so boundary controls can anchor to the entire
 * row or cell, including recursively rendered child blocks.
 * @returns A marker ref and the nearest owning BlockView once mounted.
 */
function useBlockHost(): { readonly marker: RefObject<HTMLDivElement | null>; readonly host: HTMLElement | null } {
  const marker = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(marker.current?.closest<HTMLElement>("[data-block-id]") ?? null);
  }, []);
  return { marker, host };
}

/**
 * Inserts a same-width row after an existing row in one undo transaction.
 * @param reactEditor - Active React editor runtime.
 * @param rowId - Existing row that owns the hovered lower boundary.
 * @returns The new row ID, or undefined when the row is no longer in a table.
 */
export function insertTableRow(reactEditor: ReactEditor, rowId: string): string | undefined {
  const tableId = reactEditor.blocks.getParentId(rowId);
  const table = tableId ? reactEditor.blocks.getBlock(tableId) : undefined;
  if (table?.type !== TABLE_BLOCK_TYPE) return undefined;
  const columns = Math.max(1, ...table.children.map((row) => row.children.length));
  const widths = Array.from({ length: columns }, (_, column) => columnWidth(
    table.children.find((row) => row.children[column])?.children[column]?.props.tableColumnWidth,
  ));
  let insertedId = "";
  reactEditor.history.batchUpdates(() => {
    reactEditor.blocks.updateBlock(table.id, { listProps: { collapsed: false } });
    insertedId = reactEditor.blocks.insertBlock(createTableRowInput(widths), rowId);
  });
  return insertedId;
}

/**
 * Inserts one cell at the same boundary in every row, preserving a rectangle.
 * @param reactEditor - Active React editor runtime.
 * @param cellId - Cell that owns the hovered right boundary.
 * @returns IDs of the inserted cells, or an empty list outside a table.
 */
export function insertTableColumn(reactEditor: ReactEditor, cellId: string): readonly string[] {
  const rowId = reactEditor.blocks.getParentId(cellId);
  const tableId = rowId ? reactEditor.blocks.getParentId(rowId) : undefined;
  const row = rowId ? reactEditor.blocks.getBlock(rowId) : undefined;
  const table = tableId ? reactEditor.blocks.getBlock(tableId) : undefined;
  const column = row?.children.findIndex((cell) => cell.id === cellId) ?? -1;
  if (row?.type !== TABLE_ROW_BLOCK_TYPE || table?.type !== TABLE_BLOCK_TYPE || column < 0) return [];
  const width = columnWidth(row.children[column]?.props.tableColumnWidth);
  const insertedIds: string[] = [];
  reactEditor.history.batchUpdates(() => {
    reactEditor.blocks.updateBlock(table.id, { listProps: { collapsed: false } });
    table.children.forEach((tableRow) => {
      reactEditor.blocks.updateBlock(tableRow.id, { listProps: { collapsed: false } });
      const anchor = tableRow.children[column] ?? tableRow.children.at(-1);
      const insertedId = reactEditor.blocks.insertBlock(createTableCellInput(width), anchor?.id);
      if (!anchor) reactEditor.blocks.moveBlocks([insertedId], tableRow.id, "inside");
      insertedIds.push(insertedId);
    });
  });
  return insertedIds;
}

/**
 * Resolves every existing cell at one column index.
 * @param reactEditor - Active React editor runtime.
 * @param tableId - Candidate table block ID.
 * @param column - Zero-based column index.
 * @returns Current cells in row order, or an empty list for invalid input.
 */
function tableColumnCells(reactEditor: ReactEditor, tableId: string, column: number): EditorBlock[] {
  const table = reactEditor.blocks.getBlock(tableId);
  return table?.type === TABLE_BLOCK_TYPE && Number.isInteger(column) && column >= 0
    ? table.children.flatMap((row) => row.children[column] ? [row.children[column]!] : [])
    : [];
}

/**
 * Applies a transient column width directly to mounted cells during pointer movement.
 * @param reactEditor - Active React editor runtime.
 * @param tableId - Table containing the resized column.
 * @param column - Zero-based column index.
 * @param width - Preview width in CSS pixels.
 * @returns Nothing; persistence happens once when the pointer is released.
 */
function previewTableColumnWidth(reactEditor: ReactEditor, tableId: string, column: number, width: number): void {
  const root = reactEditor.events.getRoot();
  if (!root) return;
  tableColumnCells(reactEditor, tableId, column).forEach((cell) => {
    root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(cell.id)}"]`)
      ?.style.setProperty(COLUMN_WIDTH_PROPERTY, `${columnWidth(width)}px`);
  });
}

/**
 * Persists one pixel width across every cell at a table column index.
 * @param reactEditor - Active React editor runtime.
 * @param tableId - Table whose column should change.
 * @param column - Zero-based column index.
 * @param width - Requested width in CSS pixels.
 * @returns Whether a valid table column was updated.
 */
export function setTableColumnWidth(
  reactEditor: ReactEditor,
  tableId: string,
  column: number,
  width: number,
): boolean {
  const cells = tableColumnCells(reactEditor, tableId, column);
  if (cells.length === 0 || !Number.isFinite(width)) return false;
  const tableColumnWidth = columnWidth(width);
  reactEditor.blocks.updateBlocks(cells.map((cell) => ({
    id: cell.id,
    patch: { props: { ...cell.props, tableColumnWidth } },
  })));
  return true;
}

/**
 * Applies a cell's persisted pixel width to its shared BlockView without
 * replacing the recursive block shell used by selection and drag behavior.
 * @param props - Current block snapshot and remaining wrapper chain.
 * @returns Width-aware cell subtree or the unchanged non-cell subtree.
 */
function TableCellWidthWrapper({ block, children }: BlockWrapperProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const width = columnWidth(block.props.tableColumnWidth);
  useLayoutEffect(() => {
    if (block.type !== TABLE_CELL_BLOCK_TYPE) return;
    element?.style.setProperty(COLUMN_WIDTH_PROPERTY, `${width}px`);
    return () => { element?.style.removeProperty(COLUMN_WIDTH_PROPERTY); };
  }, [block.type, element, width]);
  return block.type === TABLE_CELL_BLOCK_TYPE
    ? <BlockElementRefProvider elementRef={setElement}>{children}</BlockElementRefProvider>
    : children;
}

/**
 * Reuses the shared native full-mode dialog for table subtrees.
 * @param props - Current block and its already-rendered recursive subtree.
 * @returns Expandable table or the unchanged non-table subtree.
 */
function TableDialog({ block, children }: BlockWrapperProps) {
  return block.type === TABLE_BLOCK_TYPE ? <BlockModal label="Table">{children}</BlockModal> : children;
}

/**
 * Renders a structural selection region with table dimensions when collapsed.
 * @param props - Stable table identity.
 * @returns Contentless table header; the shared tree renders its rows.
 */
export function Table({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing(blockId, { textEdit: false });
  const block = editing.block;
  if (!block) return null;
  const rows = block.children.length;
  const columns = block.children.reduce((count, row) => Math.max(count, row.children.length), 0);
  return <div {...editing.attributes} className={`${TABLE_CLASS} ${TABLE_SUMMARY_CLASS}`}>
    {block.listProps.collapsed === true && <>
      <strong>Table</strong>
      <span className={TABLE_SUMMARY_STATS_CLASS}>{rows} × {columns}</span>
    </>}
  </div>;
}

/**
 * Renders a structural row and a hover-only insertion control on its lower edge.
 * @param props - Stable row identity.
 * @returns Row marker and boundary control portal.
 */
function TableRow({ blockId }: { readonly blockId: string }) {
  const reactEditor = useReactEditor();
  const { marker, host } = useBlockHost();
  return <>
    <div ref={marker} className={ROW_CLASS} />
    {host && createPortal(<Button variant="outline" size="icon-xs" className={`${ADD_ROW_CLASS} ${BOUNDARY_BUTTON_CLASS}`} type="button"
      aria-label="Add table row below" onClick={() => insertTableRow(reactEditor, blockId)}><PlusIcon /></Button>, host)}
  </>;
}

/** Active pointer resize state retained without rerendering on every pixel. */
interface ColumnResizeGesture {
  readonly pointerId: number;
  readonly tableId: string;
  readonly column: number;
  readonly startX: number;
  readonly startWidth: number;
  width: number;
}

/**
 * Locates a cell's table column and current persisted width.
 * @param reactEditor - Active React editor runtime.
 * @param cellId - Candidate table cell ID.
 * @returns Resize location, or undefined when the cell is no longer in a table.
 */
function resolveCellColumn(
  reactEditor: ReactEditor,
  cellId: string,
): { readonly tableId: string; readonly column: number; readonly width: number } | undefined {
  const rowId = reactEditor.blocks.getParentId(cellId);
  const tableId = rowId ? reactEditor.blocks.getParentId(rowId) : undefined;
  const row = rowId ? reactEditor.blocks.getBlock(rowId) : undefined;
  const table = tableId ? reactEditor.blocks.getBlock(tableId) : undefined;
  const column = row?.children.findIndex((cell) => cell.id === cellId) ?? -1;
  return row?.type === TABLE_ROW_BLOCK_TYPE && table?.type === TABLE_BLOCK_TYPE && column >= 0
    ? { tableId: table.id, column, width: columnWidth(row.children[column]?.props.tableColumnWidth) }
    : undefined;
}

/**
 * Renders editable cell text, accepts nested blocks, and adds a full column at
 * the hovered right boundary. Enter creates a first-class child block while
 * Shift+Enter remains available for a text line break.
 * @param props - Stable cell identity.
 * @returns Editable cell and boundary control portal.
 */
function TableCell({ blockId }: { readonly blockId: string }) {
  const reactEditor = useReactEditor();
  const { marker, host } = useBlockHost();
  const resize = useRef<ColumnResizeGesture | null>(null);
  const currentWidth = columnWidth(reactEditor.blocks.getBlock(blockId)?.props.tableColumnWidth);
  /**
   * Starts a column resize from the hovered vertical boundary.
   * @param event - Primary pointer press on the resize separator.
   * @returns Nothing; subsequent movement stays captured by the separator.
   */
  const startColumnResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const location = resolveCellColumn(reactEditor, blockId);
    if (!location) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.setAttribute("data-resizing", "true");
    resize.current = {
      pointerId: event.pointerId,
      tableId: location.tableId,
      column: location.column,
      startX: event.clientX,
      startWidth: location.width,
      width: location.width,
    };
  };
  /**
   * Previews the shared column width without creating document transactions.
   * @param event - Captured pointer movement.
   * @returns Nothing; the final width is retained in the active gesture.
   */
  const previewColumnResize = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = resize.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.width = columnWidth(gesture.startWidth + event.clientX - gesture.startX);
    previewTableColumnWidth(reactEditor, gesture.tableId, gesture.column, gesture.width);
  };
  /**
   * Ends pointer capture and optionally persists the previewed width once.
   * @param event - Pointer release or cancellation event.
   * @param commit - Whether to save rather than restore the starting width.
   * @returns Nothing; the active gesture is cleared.
   */
  const finishColumnResize = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const gesture = resize.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    resize.current = null;
    event.currentTarget.removeAttribute("data-resizing");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (commit) setTableColumnWidth(reactEditor, gesture.tableId, gesture.column, gesture.width);
    else previewTableColumnWidth(reactEditor, gesture.tableId, gesture.column, gesture.startWidth);
  };
  /**
   * Offers keyboard resizing on the same accessible vertical separator.
   * @param event - Key press focused on the resize boundary.
   * @returns Nothing; left and right arrows persist one width adjustment.
   */
  const resizeColumnWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const location = resolveCellColumn(reactEditor, blockId);
    if (!location) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    setTableColumnWidth(reactEditor, location.tableId, location.column, location.width + direction * (event.shiftKey ? 50 : 10));
  };
  /**
   * Creates a nested writing block while leaving Shift+Enter for cell text.
   * @param event - Keyboard event captured from this cell's own editor.
   * @returns Nothing; accepted Enter events are handled synchronously.
   */
  return <>
    <div ref={marker} className={CELL_CLASS}>
      <MarkdownContent blockId={blockId} />
    </div>
    {host && createPortal(<Button variant="outline" size="icon-xs" className={`${ADD_COLUMN_CLASS} ${BOUNDARY_BUTTON_CLASS}`} type="button"
      aria-label="Add table column to the right" onClick={() => insertTableColumn(reactEditor, blockId)}><PlusIcon /></Button>, host)}
    {host && createPortal(<div className={RESIZE_COLUMN_CLASS} role="separator" tabIndex={0}
      aria-label="Resize table column" aria-orientation="vertical"
      aria-valuemin={MIN_COLUMN_WIDTH} aria-valuemax={MAX_COLUMN_WIDTH} aria-valuenow={currentWidth}
      onPointerDown={startColumnResize} onPointerMove={previewColumnResize}
      onPointerUp={(event) => finishColumnResize(event, true)}
      onPointerCancel={(event) => finishColumnResize(event, false)}
      onKeyDown={resizeColumnWithKeyboard} />, host)}
  </>;
}

/**
 * Registers table, row, and cell blocks plus a slash insertion action.
 * @returns Self-contained extension using existing block and drag infrastructure.
 */
export function tableExtension(): ReactEditorExtension {
  return {
    id: "block.table",
    setup: (reactEditor) => {
      reactEditor.blocks.register({
        definition: {
          type: TABLE_BLOCK_TYPE,
          title: "Table",
          metadata: { containment: { childOutline: "fixed" } },
        },
        render: Table,
        view: tableView,
      });
      reactEditor.blocks.register({
        definition: {
          type: TABLE_ROW_BLOCK_TYPE,
          title: "Table row",
          metadata: { containment: { childOutline: "fixed" } },
        },
        render: TableRow,
        view: tableRowView,
      });
      reactEditor.blocks.register({
        definition: {
          type: TABLE_CELL_BLOCK_TYPE,
          title: "Table cell",
          metadata: { containment: { childOutline: "free", outlineFloor: true } },
        },
        render: TableCell,
        view: tableCellView,
      });
      reactEditor.surfaces.registerBlockWrapper("block", TableCellWidthWrapper);
      reactEditor.surfaces.registerBlockWrapper("edgeless", TableCellWidthWrapper);
      reactEditor.surfaces.registerBlockWrapper("block", TableDialog);
      reactEditor.surfaces.registerBlockWrapper("edgeless", TableDialog);
      reactEditor.surfaces.registerBlockSlot({
        position: "right",
        component: BlockModalButton,
        when: ({ block }) => block.type === TABLE_BLOCK_TYPE,
      });
      reactEditor.slashCommands.register({
        id: "block.table.insert",
        title: "Table",
        group: "Turn into",
        keywords: ["grid", "rows", "columns", "cells"],
        isAvailable: ({ blockId }) => reactEditor.blocks.getBlock(blockId)?.children.length === 0,
        execute: ({ blockId }) => { convertLeafToContainer(reactEditor, blockId, createTableBlockInput()); },
      });
    },
  };
}
