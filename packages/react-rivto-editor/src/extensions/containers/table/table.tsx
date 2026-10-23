import { TableResizeController } from "./table-resize-controller";
import {
  columnWidth,
  TABLE_DEFAULT_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
  COLUMN_WIDTH_PROPERTY,
  CELL_ITEM_ATTRIBUTE,
} from "./table-column-width";
export { setTableColumnWidth, TABLE_DEFAULT_COLUMN_WIDTH } from "./table-column-width";
import type { CSSProperties } from "react";
import { HorizontalDropGap } from "../horizontal-drop-gap";
/**
 * Optional table presentation built entirely from ordinary document blocks.
 * Tables own rows, rows own draggable cells, and cells retain editable Markdown
 * content plus arbitrary child blocks. Shared hierarchy, drag, clipboard,
 * snapshots, and undo behavior remain owned by the existing editor managers.
 * @module
 */
import { BLOCK_TEXT_METADATA_KEY } from "../../../managers/selection/block-text-metadata";
import {
  BlockBody,
  BlockChildren,
  BlockContent,
  BlockItem,
  BlockRow,
  type BlockChildrenItemProps,
} from "@chulane/rivto-page";
import { type EditorBlock, type EditorBlockInput } from "@chulane/rivto";
import { PlusIcon } from "lucide-react";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { convertLeafToContainer } from "../convert-leaf-to-container";
import { BlockModal, BlockModalButton } from "../../../blocks/block-modal/block-modal";
import { type BlockWrapperProps } from "../../../blocks/block-wrapper/block-wrapper";
import { MarkdownContent } from "../../../blocks/markdown/markdown";
import { Button } from "../../../components/ui/button";
import { editorControlProps } from "../../../constants";
import type { ReactPanelApi } from "../../../panels/types";
import {
  useBlockNode,
  useBlockSelectionAnchor,
  useEditorRoot,
  useReactPanel,
  usePanel,
} from "../../../hooks";
import { type ReactEditorExtension } from "../../../managers";
import {
  TABLE_BLOCK_TYPE,
  TABLE_CELL_BLOCK_TYPE,
  TABLE_ROW_BLOCK_TYPE,
  tableBehavior,
  tableCellBehavior,
  tableRowBehavior,
} from "./table-behavior";

export { TABLE_BLOCK_TYPE, TABLE_CELL_BLOCK_TYPE, TABLE_ROW_BLOCK_TYPE } from "./table-behavior";

const TABLE_CLASS = "rivto-table";
const TABLE_SUMMARY_CLASS = "rivto-table-summary flex items-center gap-2";
const TABLE_SUMMARY_STATS_CLASS = "text-xs tabular-nums text-muted-foreground";
const ROW_CLASS = "rivto-table-row";
const CELL_CLASS = "rivto-table-cell";
/** Placement and hover reveal live in table.css; the round badge look is utility-based. */
const BOUNDARY_BUTTON_CLASS =
  "size-[22px] rounded-full border-input bg-background text-primary shadow-sm hover:bg-background hover:text-primary [&_svg]:size-3.5";
const ADD_ROW_CLASS = "rivto-table-add-row";
const ADD_COLUMN_CLASS = "rivto-table-add-column";
const RESIZE_COLUMN_CLASS = "rivto-table-resize-column";

/** CSS width variable owned by this concrete container placement. */
interface TableCellPlacementStyle extends CSSProperties {
  readonly [COLUMN_WIDTH_PROPERTY]: string;
}
const CELL_ITEM_CLASS = "rivto-table-cell-item";

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
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Table ${label} must be a positive integer`);
  }
  return value;
}

/**
 * Creates one editable cell that may later own arbitrary child blocks.
 * @param width - Persisted preferred width in CSS pixels.
 * @returns Portable empty cell input.
 */
function createTableCellInput(width = TABLE_DEFAULT_COLUMN_WIDTH): EditorBlockInput {
  return {
    type: TABLE_CELL_BLOCK_TYPE,
    content: "",
    props: { tableColumnWidth: columnWidth(width) },
  };
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
  const widths = Array.from({ length: tableDimension(columns, "column count") }, () =>
    columnWidth(width),
  );
  return {
    type: TABLE_BLOCK_TYPE,
    content: "",
    children: Array.from({ length: tableDimension(rows, "row count") }, () =>
      createTableRowInput(widths),
    ),
  };
}

/**
 * Locates the current block shell so boundary controls can anchor to the entire
 * row or cell, including recursively rendered child blocks.
 * @returns A marker ref and the nearest owning block shell once mounted.
 */
function useBlockHost(): {
  readonly marker: RefObject<HTMLDivElement | null>;
  readonly host: HTMLElement | null;
} {
  const marker = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(marker.current?.closest<HTMLElement>("[data-block-id]") ?? null);
  }, []);
  return { marker, host };
}

/**
 * Inserts a same-width row after an existing row in one undo transaction.
 * @param reactPanel - Active editor view.
 * @param rowId - Existing row that owns the hovered lower boundary.
 * @returns The complete new row, or undefined outside a table.
 */
export function insertTableRow(reactPanel: ReactPanelApi, rowId: string): EditorBlock | undefined {
  const tableId = reactPanel.blocks.getParentId(rowId);
  const table = tableId ? reactPanel.blocks.getBlock(tableId) : undefined;
  if (table?.type !== TABLE_BLOCK_TYPE) {
    return undefined;
  }
  const columns = Math.max(1, ...table.children.map((row) => row.children.length));
  const widths = Array.from({ length: columns }, (value, column) =>
    columnWidth(
      table.children.find((row) => row.children[column])?.children[column]?.props.tableColumnWidth,
    ),
  );
  let inserted: EditorBlock | undefined;
  reactPanel.batchUpdates(() => {
    reactPanel.blocks.updateBlock(table.id, { listProps: { collapsed: false } });
    inserted = reactPanel.blocks.insertBlock(
      createTableRowInput(widths),
      reactPanel.blocks.getInsertionDestinationAfter(rowId),
    );
  });
  return inserted;
}

/**
 * Inserts one cell at the same boundary in every row, preserving a rectangle.
 * @param reactPanel - Active editor view.
 * @param cellId - Cell that owns the hovered right boundary.
 * @returns Complete inserted cells, or an empty list outside a table.
 */
export function insertTableColumn(
  reactPanel: ReactPanelApi,
  cellId: string,
): readonly EditorBlock[] {
  const rowId = reactPanel.blocks.getParentId(cellId);
  const tableId = rowId ? reactPanel.blocks.getParentId(rowId) : undefined;
  const row = rowId ? reactPanel.blocks.getBlock(rowId) : undefined;
  const table = tableId ? reactPanel.blocks.getBlock(tableId) : undefined;
  const column = row?.children.findIndex((cell) => cell.id === cellId) ?? -1;
  if (row?.type !== TABLE_ROW_BLOCK_TYPE || table?.type !== TABLE_BLOCK_TYPE || column < 0) {
    return [];
  }
  const width = columnWidth(row.children[column]?.props.tableColumnWidth);
  const inserted: EditorBlock[] = [];
  reactPanel.batchUpdates(() => {
    reactPanel.blocks.updateBlock(table.id, { listProps: { collapsed: false } });
    table.children.forEach((tableRow) => {
      reactPanel.blocks.updateBlock(tableRow.id, { listProps: { collapsed: false } });
      const anchor = tableRow.children[column] ?? tableRow.children.at(-1);
      const cell = reactPanel.blocks.insertBlock(
        createTableCellInput(width),
        anchor
          ? reactPanel.blocks.getInsertionDestinationAfter(anchor.id)
          : { parentId: tableRow.id },
      );
      inserted.push(cell);
    });
  });
  return inserted;
}

/**
 * Places table rows through Page while retaining the empty table's child host.
 *
 * @returns Table summary, body contributions, and Page-owned rows without outline indentation.
 */
function TableLayout() {
  return (
    <>
      <BlockRow>
        <BlockContent />
      </BlockRow>
      <BlockBody />
      <BlockChildren dropAxis="vertical" emptyDropTarget />
    </>
  );
}

/**
 * Places a row's existing cells in width-aware Page items without rendering a second tree.
 *
 * Page supplies canonical before/after neighbors to horizontal gap regions. Cell
 * widths remain owned by their placement items, including during resize previews;
 * gaps do not become persisted cells or participate in column-index commands.
 *
 * @returns The row's boundary controls and its Page-owned horizontal cell group.
 */
function TableRowLayout() {
  return (
    <>
      <BlockRow>
        <BlockContent />
      </BlockRow>
      <BlockBody />
      <BlockChildren
        dropAxis="horizontal"
        item={TableCellItem}
        gap={HorizontalDropGap}
        emptyDropTarget
      />
    </>
  );
}

/**
 * Owns cell placement width on an explicit item rather than borrowing the block shell's ref.
 *
 * Width changes flow from the addressed host snapshot; descendants and the unique
 * block identity remain owned by Page. Resize preview writes this same item's variable.
 *
 * @param props - Cell identity and the already-rendered Page node.
 * @param props.blockId - Persisted cell whose preferred width is observed.
 * @param props.children - Page shell rendered exactly once.
 * @returns Width-aware placement containing the supplied cell.
 */
function TableCellItem({ blockId, children }: BlockChildrenItemProps) {
  const { block } = useBlockNode(blockId);
  const style: TableCellPlacementStyle = {
    [COLUMN_WIDTH_PROPERTY]: `${columnWidth(block?.props.tableColumnWidth)}px`,
  };
  return (
    <BlockItem className={CELL_ITEM_CLASS} {...{ [CELL_ITEM_ATTRIBUTE]: true }} style={style}>
      {children}
    </BlockItem>
  );
}

/**
 * Reuses the shared modal subtree panel for expanded table editing.
 * @param props - Current block and its already-rendered recursive subtree.
 * @returns Expandable table or the unchanged non-table subtree.
 */
function TableDialog({ block, children }: BlockWrapperProps) {
  return block.type === TABLE_BLOCK_TYPE ? (
    <BlockModal blockId={block.id} label="Table">
      {children}
    </BlockModal>
  ) : (
    children
  );
}

/**
 * Reads row count and the widest nested cell count without materializing the
 * recursive table tree. Structure changes refresh the primitive snapshot.
 *
 * @param tableId - Persisted table identifier.
 * @returns Current row count and maximum cells in any row.
 */
function useTableDimensions(tableId: string): { readonly rows: number; readonly columns: number } {
  const panel = usePanel();
  const subscribe = useCallback(
    (listener: () => void) => panel.blocks.subscribeStructure(listener),
    [panel],
  );
  const getSnapshot = useCallback(() => {
    const rowIds = panel.blocks.getBlockNode(tableId)?.childIds ?? [];
    let columns = 0;
    rowIds.forEach((rowId) => {
      columns = Math.max(columns, panel.blocks.getBlockNode(rowId)?.childIds.length ?? 0);
    });
    return `${rowIds.length}:${columns}`;
  }, [tableId, panel]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const separator = snapshot.indexOf(":");
  return {
    rows: Number(snapshot.slice(0, separator)),
    columns: Number(snapshot.slice(separator + 1)),
  };
}

/**
 * Renders a structural selection region with table dimensions when collapsed.
 * @param props - Stable table identity.
 * @returns Contentless table header; the shared tree renders its rows.
 */
export function Table({ blockId }: { readonly blockId: string }) {
  const editing = useBlockNode(blockId);
  const attributes = useBlockSelectionAnchor(blockId);
  const { rows, columns } = useTableDimensions(blockId);
  const block = editing.block;
  if (!block) {
    return null;
  }
  return (
    <div {...attributes} className={`${TABLE_CLASS} ${TABLE_SUMMARY_CLASS}`}>
      {block.listProps.collapsed === true && (
        <>
          <strong>Table</strong>
          <span className={TABLE_SUMMARY_STATS_CLASS}>
            {rows} × {columns}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Renders a structural row and a hover-only insertion control on its lower edge.
 * @param props - Stable row identity.
 * @returns Row marker and boundary control portal.
 */
function TableRow({ blockId }: { readonly blockId: string }) {
  const reactPanel = useReactPanel();
  const { marker, host } = useBlockHost();
  return (
    <>
      <div ref={marker} className={ROW_CLASS} />
      {host &&
        createPortal(
          <Button
            {...editorControlProps}
            variant="outline"
            size="icon-xs"
            className={`${ADD_ROW_CLASS} ${BOUNDARY_BUTTON_CLASS}`}
            type="button"
            aria-label="Add table row below"
            onClick={() => insertTableRow(reactPanel, blockId)}
          >
            <PlusIcon />
          </Button>,
          host,
        )}
    </>
  );
}

/** Persisted cell identity supplied by the host's renderer registration. */
interface TableCellRendererProps {
  readonly blockId: string;
}

/**
 * Renders editable cell text, accepts nested blocks, and adds a full column at
 * the hovered right boundary. Enter creates a first-class child block while
 * Shift+Enter remains available for a text line break.
 *
 * The attachment effect owns the resize controller and cancels its session before
 * replacing the occurrence. Per-pointer state remains outside React rendering.
 *
 * @param props - Stable cell identity.
 * @param props.blockId - Persisted table cell whose content and column controls are rendered.
 * @returns Editable cell and boundary control portal.
 */
function TableCell({ blockId }: TableCellRendererProps) {
  const reactPanel = useReactPanel();
  const { element: root } = useEditorRoot();
  const { marker, host } = useBlockHost();
  const controller = useRef<TableResizeController | null>(null);
  useLayoutEffect(() => {
    const resize = new TableResizeController(reactPanel, blockId, root);
    controller.current = resize;
    return () => {
      controller.current = null;
      resize.cancel();
    };
  }, [reactPanel, blockId, root]);
  const currentWidth = columnWidth(reactPanel.blocks.getBlockNode(blockId)?.props.tableColumnWidth);
  return (
    <>
      <div ref={marker} className={CELL_CLASS}>
        <MarkdownContent blockId={blockId} />
      </div>
      {host &&
        createPortal(
          <Button
            {...editorControlProps}
            variant="outline"
            size="icon-xs"
            className={`${ADD_COLUMN_CLASS} ${BOUNDARY_BUTTON_CLASS}`}
            type="button"
            aria-label="Add table column to the right"
            onClick={() => insertTableColumn(reactPanel, blockId)}
          >
            <PlusIcon />
          </Button>,
          host,
        )}
      {host &&
        createPortal(
          <div
            {...editorControlProps}
            className={RESIZE_COLUMN_CLASS}
            role="separator"
            tabIndex={0}
            aria-label="Resize table column"
            aria-orientation="vertical"
            aria-valuemin={MIN_COLUMN_WIDTH}
            aria-valuemax={MAX_COLUMN_WIDTH}
            aria-valuenow={currentWidth}
            onPointerDown={(event) =>
              controller.current?.start(event.nativeEvent, event.currentTarget)
            }
            onPointerMove={(event) => controller.current?.move(event.nativeEvent)}
            onPointerUp={(event) => controller.current?.finish(event.nativeEvent, true)}
            onPointerCancel={(event) => controller.current?.finish(event.nativeEvent, false)}
            onLostPointerCapture={(event) => controller.current?.finish(event.nativeEvent, false)}
            onKeyDown={(event) => controller.current?.resizeWithKeyboard(event.nativeEvent)}
          />,
          host,
        )}
    </>
  );
}

/**
 * Registers table, row, and cell blocks plus a slash insertion action.
 * @returns Self-contained extension using existing block and drag infrastructure.
 */
export function tableExtension(): ReactEditorExtension {
  return {
    id: "block.table",
    setup: (reactEditor) => {
      reactEditor.blockTypes.register({
        definition: {
          type: TABLE_BLOCK_TYPE,
          title: "Table",
        },
        render: Table,
        layout: TableLayout,
        behavior: tableBehavior,
      });
      reactEditor.blockTypes.register({
        definition: {
          type: TABLE_ROW_BLOCK_TYPE,
          title: "Table row",
        },
        render: TableRow,
        layout: TableRowLayout,
        behavior: tableRowBehavior,
      });
      reactEditor.blockTypes.register({
        definition: {
          type: TABLE_CELL_BLOCK_TYPE,
          title: "Table cell",
          metadata: {
            [BLOCK_TEXT_METADATA_KEY]: true,
          },
        },
        render: TableCell,
        behavior: tableCellBehavior,
      });
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
        isAvailable: ({ blockId, reactPanel }) =>
          reactPanel.blocks.hasBlock(blockId) && !reactPanel.blocks.hasChildren(blockId),
        execute: ({ blockId, reactPanel }) => {
          convertLeafToContainer(reactPanel, blockId, createTableBlockInput());
        },
      });
    },
  };
}
