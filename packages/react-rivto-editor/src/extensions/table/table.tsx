/**
 * Optional table presentation built entirely from ordinary document blocks.
 * Tables own rows, rows own draggable cells, and cells retain editable Markdown
 * content plus arbitrary child blocks. Shared hierarchy, drag, clipboard,
 * snapshots, and undo behavior remain owned by the existing editor managers.
 * @module
 */
import { createCaretSelection, type EditorBlock, type EditorBlockInput } from "@chulane/rivto";
import { createPortal } from "react-dom";
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { BlockElementRefProvider, type BlockWrapperProps } from "../../blocks/block-wrapper";
import { BlockModal, BlockModalButton } from "../../blocks/block-modal";
import { MarkdownContent } from "../../blocks/markdown";
import { useReactEditor } from "../../hooks";
import { focusBlock, type ReactEditorExtension } from "../../managers";
import type { ReactEditor } from "../../types";

export const TABLE_BLOCK_TYPE = "table";
export const TABLE_ROW_BLOCK_TYPE = "table-row";
export const TABLE_CELL_BLOCK_TYPE = "table-cell";
export const TABLE_DEFAULT_COLUMN_WIDTH = 180;

const TABLE_CLASS = "rivto-table";
const ROW_CLASS = "rivto-table-row";
const CELL_CLASS = "rivto-table-cell";
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

const TABLE_STYLES = `
[data-block-type="${TABLE_BLOCK_TYPE}"] > .page-block-children {
  margin: 8px 0 16px;
  overflow-x: auto;
  border: 1px solid #dcdfe4;
  border-radius: 10px;
}
[data-block-type="${TABLE_ROW_BLOCK_TYPE}"] { position: relative; width: max-content; min-width: 100%; }
[data-block-type="${TABLE_ROW_BLOCK_TYPE}"] > .page-block-row { min-height: 0; }
[data-block-type="${TABLE_ROW_BLOCK_TYPE}"] > .page-block-children {
  display: flex;
  align-items: stretch;
  width: max-content;
  min-width: 100%;
  margin: 0;
}
[data-block-type="${TABLE_ROW_BLOCK_TYPE}"] + [data-block-type="${TABLE_ROW_BLOCK_TYPE}"] {
  border-top: 1px solid #dcdfe4;
}
[data-block-type="${TABLE_CELL_BLOCK_TYPE}"] {
  position: relative;
  flex: 0 0 var(${COLUMN_WIDTH_PROPERTY}, ${TABLE_DEFAULT_COLUMN_WIDTH}px);
  width: var(${COLUMN_WIDTH_PROPERTY}, ${TABLE_DEFAULT_COLUMN_WIDTH}px);
  min-width: ${MIN_COLUMN_WIDTH}px;
  padding: 10px 12px;
  box-sizing: border-box;
  /* Width reflow is not a reorder; suppress the shared FLIP move animation. */
  transform: none !important;
}
[data-block-type="${TABLE_CELL_BLOCK_TYPE}"] + [data-block-type="${TABLE_CELL_BLOCK_TYPE}"] {
  border-left: 1px solid #dcdfe4;
}
[data-block-type="${TABLE_CELL_BLOCK_TYPE}"] > .page-block-children { margin: 8px 0 0 16px; }
[data-block-type="${TABLE_CELL_BLOCK_TYPE}"][data-drop-inside="true"] {
  outline: 2px solid var(--rivto-accent, #6c5ce7);
  outline-offset: -2px;
}
[data-block-type="${TABLE_BLOCK_TYPE}"] .page-block-row::before { inset: 0; width: auto; }
[data-block-type="${TABLE_BLOCK_TYPE}"] .rivto-slot[data-slot-position="left-top"] {
  position: relative;
  inset: auto;
  transform: none;
  order: -1;
}
.${ROW_CLASS}, .${TABLE_CLASS} { min-height: 1px; }
.${ADD_ROW_CLASS}, .${ADD_COLUMN_CLASS} {
  position: absolute;
  z-index: 5;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid #c7c2d1;
  border-radius: 50%;
  color: var(--rivto-accent, #6c5ce7);
  background: white;
  box-shadow: 0 1px 4px rgb(9 30 66 / 20%);
  cursor: pointer;
  opacity: 0;
}
.${ADD_ROW_CLASS} { left: 50%; bottom: -11px; translate: -50% 0; }
.${ADD_COLUMN_CLASS} { top: 50%; right: -11px; translate: 0 -50%; }
.${ADD_ROW_CLASS}:hover, .${ADD_COLUMN_CLASS}:hover,
.${ADD_ROW_CLASS}:focus-visible, .${ADD_COLUMN_CLASS}:focus-visible { opacity: 1; }
.${ADD_ROW_CLASS}:focus-visible, .${ADD_COLUMN_CLASS}:focus-visible {
  outline: 2px solid var(--rivto-accent, #6c5ce7);
  outline-offset: 2px;
}
.${RESIZE_COLUMN_CLASS} {
  position: absolute;
  z-index: 4;
  top: 0;
  right: -4px;
  bottom: 0;
  width: 8px;
  background: linear-gradient(90deg, transparent 3px, var(--rivto-accent, #6c5ce7) 3px 5px, transparent 5px);
  cursor: col-resize;
  opacity: 0;
  touch-action: none;
}
.${RESIZE_COLUMN_CLASS}:hover,
.${RESIZE_COLUMN_CLASS}:focus-visible,
.${RESIZE_COLUMN_CLASS}[data-resizing="true"] { opacity: 1; }
.${RESIZE_COLUMN_CLASS}:focus-visible { outline: 2px solid var(--rivto-accent, #6c5ce7); outline-offset: 1px; }
`;

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
    content: "Table",
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
 * @param runtime - Active React editor runtime.
 * @param rowId - Existing row that owns the hovered lower boundary.
 * @returns The new row ID, or undefined when the row is no longer in a table.
 */
export function insertTableRow(runtime: ReactEditor, rowId: string): string | undefined {
  const tableId = runtime.editor.blocks.getParentId(rowId);
  const table = tableId ? runtime.editor.blocks.getBlock(tableId) : undefined;
  if (table?.type !== TABLE_BLOCK_TYPE) return undefined;
  const columns = Math.max(1, ...table.children.map((row) => row.children.length));
  const widths = Array.from({ length: columns }, (_, column) => columnWidth(
    table.children.find((row) => row.children[column])?.children[column]?.props.tableColumnWidth,
  ));
  let insertedId = "";
  runtime.editor.batchUpdates(() => {
    runtime.blocks.updateBlock(table.id, { listProps: { collapsed: false } });
    insertedId = runtime.blocks.insertBlock(createTableRowInput(widths), rowId);
  });
  return insertedId;
}

/**
 * Inserts one cell at the same boundary in every row, preserving a rectangle.
 * @param runtime - Active React editor runtime.
 * @param cellId - Cell that owns the hovered right boundary.
 * @returns IDs of the inserted cells, or an empty list outside a table.
 */
export function insertTableColumn(runtime: ReactEditor, cellId: string): readonly string[] {
  const rowId = runtime.editor.blocks.getParentId(cellId);
  const tableId = rowId ? runtime.editor.blocks.getParentId(rowId) : undefined;
  const row = rowId ? runtime.editor.blocks.getBlock(rowId) : undefined;
  const table = tableId ? runtime.editor.blocks.getBlock(tableId) : undefined;
  const column = row?.children.findIndex((cell) => cell.id === cellId) ?? -1;
  if (row?.type !== TABLE_ROW_BLOCK_TYPE || table?.type !== TABLE_BLOCK_TYPE || column < 0) return [];
  const width = columnWidth(row.children[column]?.props.tableColumnWidth);
  const insertedIds: string[] = [];
  runtime.editor.batchUpdates(() => {
    runtime.blocks.updateBlock(table.id, { listProps: { collapsed: false } });
    table.children.forEach((tableRow) => {
      runtime.blocks.updateBlock(tableRow.id, { listProps: { collapsed: false } });
      const anchor = tableRow.children[column] ?? tableRow.children.at(-1);
      const insertedId = runtime.blocks.insertBlock(createTableCellInput(width), anchor?.id);
      if (!anchor) runtime.editor.blocks.moveBlocks([insertedId], tableRow.id, "inside");
      insertedIds.push(insertedId);
    });
  });
  return insertedIds;
}

/**
 * Resolves every existing cell at one column index.
 * @param runtime - Active React editor runtime.
 * @param tableId - Candidate table block ID.
 * @param column - Zero-based column index.
 * @returns Current cells in row order, or an empty list for invalid input.
 */
function tableColumnCells(runtime: ReactEditor, tableId: string, column: number): EditorBlock[] {
  const table = runtime.editor.blocks.getBlock(tableId);
  return table?.type === TABLE_BLOCK_TYPE && Number.isInteger(column) && column >= 0
    ? table.children.flatMap((row) => row.children[column] ? [row.children[column]!] : [])
    : [];
}

/**
 * Applies a transient column width directly to mounted cells during pointer movement.
 * @param runtime - Active React editor runtime.
 * @param tableId - Table containing the resized column.
 * @param column - Zero-based column index.
 * @param width - Preview width in CSS pixels.
 * @returns Nothing; persistence happens once when the pointer is released.
 */
function previewTableColumnWidth(runtime: ReactEditor, tableId: string, column: number, width: number): void {
  const root = runtime.events.getRoot();
  if (!root) return;
  tableColumnCells(runtime, tableId, column).forEach((cell) => {
    root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(cell.id)}"]`)
      ?.style.setProperty(COLUMN_WIDTH_PROPERTY, `${columnWidth(width)}px`);
  });
}

/**
 * Persists one pixel width across every cell at a table column index.
 * @param runtime - Active React editor runtime.
 * @param tableId - Table whose column should change.
 * @param column - Zero-based column index.
 * @param width - Requested width in CSS pixels.
 * @returns Whether a valid table column was updated.
 */
export function setTableColumnWidth(
  runtime: ReactEditor,
  tableId: string,
  column: number,
  width: number,
): boolean {
  const cells = tableColumnCells(runtime, tableId, column);
  if (cells.length === 0 || !Number.isFinite(width)) return false;
  const tableColumnWidth = columnWidth(width);
  runtime.blocks.updateBlocks(cells.map((cell) => ({
    id: cell.id,
    patch: { props: { ...cell.props, tableColumnWidth } },
  })));
  return true;
}

/**
 * Supplies extension-local CSS without requiring changes to the package stylesheet.
 * @returns One scoped style element mounted with the extension lifecycle.
 */
function TableStyles() {
  return <style>{TABLE_STYLES}</style>;
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
 * Renders the editable table title and vertical row-sort marker.
 * @param props - Stable table identity.
 * @returns Editable title content.
 */
export function Table({ blockId }: { readonly blockId: string }) {
  return <div className={TABLE_CLASS} data-block-sort-children="vertical"><MarkdownContent blockId={blockId} /></div>;
}

/**
 * Renders a structural row and a hover-only insertion control on its lower edge.
 * @param props - Stable row identity.
 * @returns Row marker and boundary control portal.
 */
function TableRow({ blockId }: { readonly blockId: string }) {
  const runtime = useReactEditor();
  const { marker, host } = useBlockHost();
  return <>
    <div ref={marker} className={ROW_CLASS} data-block-sort-children="horizontal" />
    {host && createPortal(<button className={ADD_ROW_CLASS} type="button" aria-label="Add table row below"
      onClick={() => insertTableRow(runtime, blockId)}>+</button>, host)}
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
 * @param runtime - Active React editor runtime.
 * @param cellId - Candidate table cell ID.
 * @returns Resize location, or undefined when the cell is no longer in a table.
 */
function resolveCellColumn(
  runtime: ReactEditor,
  cellId: string,
): { readonly tableId: string; readonly column: number; readonly width: number } | undefined {
  const rowId = runtime.editor.blocks.getParentId(cellId);
  const tableId = rowId ? runtime.editor.blocks.getParentId(rowId) : undefined;
  const row = rowId ? runtime.editor.blocks.getBlock(rowId) : undefined;
  const table = tableId ? runtime.editor.blocks.getBlock(tableId) : undefined;
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
  const runtime = useReactEditor();
  const { marker, host } = useBlockHost();
  const resize = useRef<ColumnResizeGesture | null>(null);
  const currentWidth = columnWidth(runtime.editor.blocks.getBlock(blockId)?.props.tableColumnWidth);
  /**
   * Starts a column resize from the hovered vertical boundary.
   * @param event - Primary pointer press on the resize separator.
   * @returns Nothing; subsequent movement stays captured by the separator.
   */
  const startColumnResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const location = resolveCellColumn(runtime, blockId);
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
    previewTableColumnWidth(runtime, gesture.tableId, gesture.column, gesture.width);
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
    if (commit) setTableColumnWidth(runtime, gesture.tableId, gesture.column, gesture.width);
    else previewTableColumnWidth(runtime, gesture.tableId, gesture.column, gesture.startWidth);
  };
  /**
   * Offers keyboard resizing on the same accessible vertical separator.
   * @param event - Key press focused on the resize boundary.
   * @returns Nothing; left and right arrows persist one width adjustment.
   */
  const resizeColumnWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const location = resolveCellColumn(runtime, blockId);
    if (!location) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    setTableColumnWidth(runtime, location.tableId, location.column, location.width + direction * (event.shiftKey ? 50 : 10));
  };
  /**
   * Creates a nested writing block while leaving Shift+Enter for cell text.
   * @param event - Keyboard event captured from this cell's own editor.
   * @returns Nothing; accepted Enter events are handled synchronously.
   */
  const addBlock = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey
      || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    let childId = "";
    runtime.editor.batchUpdates(() => {
      runtime.blocks.updateBlock(blockId, { listProps: { collapsed: false } });
      childId = runtime.blocks.insertBlock(runtime.createDefaultBlock());
      runtime.editor.blocks.moveBlocks([childId], blockId, "inside");
      runtime.selection.set(createCaretSelection(childId, 0));
    });
    requestAnimationFrame(() => {
      const root = runtime.events.getRoot();
      if (root) focusBlock(root, childId, 0);
    });
  };
  return <>
    <div ref={marker} className={CELL_CLASS} data-block-drop-container="" onKeyDownCapture={addBlock}>
      <MarkdownContent blockId={blockId} />
    </div>
    {host && createPortal(<button className={ADD_COLUMN_CLASS} type="button" aria-label="Add table column to the right"
      onClick={() => insertTableColumn(runtime, blockId)}>+</button>, host)}
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
    setup: (runtime) => {
      runtime.extensions.mount(TableStyles);
      runtime.blocks.register({
        definition: { type: TABLE_BLOCK_TYPE, title: "Table" },
        render: Table,
      });
      runtime.blocks.register({
        definition: { type: TABLE_ROW_BLOCK_TYPE, title: "Table row", allowedParents: [TABLE_BLOCK_TYPE] },
        render: TableRow,
      });
      runtime.blocks.register({
        definition: { type: TABLE_CELL_BLOCK_TYPE, title: "Table cell", allowedParents: [TABLE_ROW_BLOCK_TYPE] },
        render: TableCell,
      });
      runtime.surfaces.registerBlockWrapper("block", TableCellWidthWrapper);
      runtime.surfaces.registerBlockWrapper("edgeless", TableCellWidthWrapper);
      runtime.surfaces.registerBlockWrapper("block", TableDialog);
      runtime.surfaces.registerBlockWrapper("edgeless", TableDialog);
      runtime.surfaces.registerBlockSlot({
        position: "right",
        component: BlockModalButton,
        when: ({ block }) => block.type === TABLE_BLOCK_TYPE,
      });
      runtime.slashCommands.register({
        id: "block.table.insert",
        title: "Table",
        group: "Insert",
        keywords: ["grid", "rows", "columns", "cells"],
        execute: ({ blockId }) => { runtime.blocks.insertBlock(createTableBlockInput(), blockId); },
      });
    },
  };
}
