/**
 * Verifies the table extension keeps rows and cells in the ordinary block tree,
 * inserts complete row and column boundaries, and participates in undo.
 * @module
 */
import { createTestCoreEditor } from "../../test-utils";
import { createReactEditor } from "../../react-editor";
import { defaultWritingBlockExtension } from "../page/default-writing-block";
import {
  createTableBlockInput,
  insertTableColumn,
  insertTableRow,
  setTableColumnWidth,
  tableExtension,
  TABLE_BLOCK_TYPE,
  TABLE_CELL_BLOCK_TYPE,
  TABLE_ROW_BLOCK_TYPE,
} from "./table";

test("inserts rectangular rows and columns as draggable ordinary blocks", () => {
  const editor = createTestCoreEditor();
  const runtime = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), tableExtension()],
  });
  const before = editor.blocks.insertBlock({ type: "paragraph", content: "Before" });
  runtime.slashCommands.execute("block.table.insert", { blockId: before });
  const table = editor.blocks.getBlocks().find((block) => block.type === TABLE_BLOCK_TYPE)!;

  expect(table.children).toHaveLength(3);
  expect(table.children.every((row) => row.type === TABLE_ROW_BLOCK_TYPE && row.children.length === 3)).toBe(true);
  expect(table.children.flatMap((row) => row.children).every((cell) => cell.type === TABLE_CELL_BLOCK_TYPE)).toBe(true);
  expect(table.children.flatMap((row) => row.children).every((cell) => cell.props.tableColumnWidth === 180)).toBe(true);

  const rowId = table.children[0]!.id;
  const cellId = table.children[0]!.children[0]!.id;
  expect(setTableColumnWidth(runtime, table.id, 1, 260)).toBe(true);
  expect(editor.blocks.getBlock(table.id)?.children.every((row) => row.children[1]?.props.tableColumnWidth === 260)).toBe(true);
  const addedRow = insertTableRow(runtime, rowId)!;
  expect(editor.blocks.getBlock(addedRow)?.children).toHaveLength(3);
  expect(editor.blocks.getBlock(addedRow)?.children[1]?.props.tableColumnWidth).toBe(260);

  editor.history.clear();
  const addedCells = insertTableColumn(runtime, cellId);
  expect(addedCells).toHaveLength(4);
  expect(editor.blocks.getBlock(table.id)?.children.every((row) => row.children.length === 4)).toBe(true);
  editor.history.undo();
  expect(editor.blocks.getBlock(table.id)?.children.every((row) => row.children.length === 3)).toBe(true);

  expect(() => editor.blocks.moveBlocks([cellId], table.id, "inside")).toThrow();
  runtime.destroy();
  editor.destroy();
});

test("validates requested table dimensions", () => {
  expect(() => createTableBlockInput(0, 3)).toThrow("Table row count must be a positive integer");
  expect(() => createTableBlockInput(3, 1.5)).toThrow("Table column count must be a positive integer");
  expect(createTableBlockInput(1, 1, 320).children?.[0]?.children?.[0]?.props?.tableColumnWidth).toBe(320);
});
