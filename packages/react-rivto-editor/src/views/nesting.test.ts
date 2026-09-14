/**
 * Nested container matrix: kanban in bento, bento in bento, columns in a
 * kanban column, table in a bento tile, and bento in a table cell.
 *
 * Each case checks Tab/Shift+Tab at every relevant depth and a lateral move
 * that must remain legal. React definition metadata owns containment. Explicit
 * drag/`moveBlocks` may leave a floor.
 *
 * @module
 */
import { createTestCoreEditor } from "../test-utils";
import { createReactEditor } from "../react-editor";
import { defaultWritingBlockExtension } from "../extensions/built-ins/page/default-writing-block";
import { bentoExtension, createBentoBlockInput, BENTO_BLOCK_TYPE } from "../extensions/built-ins/bento/bento";
import { kanbanExtension, createKanbanBlockInput } from "../extensions/built-ins/kanban/kanban";
import { columnsExtension, createColumnsBlockInput } from "../extensions/built-ins/columns/columns";
import { tableExtension, createTableBlockInput, TABLE_BLOCK_TYPE, TABLE_CELL_BLOCK_TYPE } from "../extensions/built-ins/table/table";
import { getBlockContainment } from "../managers/blocks/block-types";
import { indentBlocks, outdentBlocks } from "./ops/outline-ops";

function createNestedRuntime() {
  const editor = createTestCoreEditor();
  const runtime = createReactEditor({
    editor,
    extensions: [
      defaultWritingBlockExtension(),
      bentoExtension(),
      kanbanExtension(),
      columnsExtension(),
      tableExtension(),
    ],
  });
  return { editor, runtime };
}

test("kanban inside bento freezes tiles and floors cards at the column", () => {
  const { editor, runtime } = createNestedRuntime();
  const bento = editor.blocks.insertBlock(createBentoBlockInput());
  const kanban = editor.blocks.insertBlock(createKanbanBlockInput());
  editor.blocks.moveBlocks([kanban], bento, "inside");
  const column = editor.blocks.getBlock(kanban)!.children[0]!;
  const card = editor.blocks.insertBlock({ type: "paragraph", content: "Card" });
  editor.blocks.moveBlocks([card], column.id, "inside");

  expect(editor.blocks.getParentId(kanban)).toBe(bento);
  indentBlocks(runtime, [kanban]);
  outdentBlocks(runtime, [kanban]);
  expect(editor.blocks.getParentId(kanban)).toBe(bento);

  expect(editor.blocks.getParentId(column.id)).toBe(kanban);
  indentBlocks(runtime, [column.id]);
  expect(editor.blocks.getParentId(column.id)).toBe(kanban);

  const sibling = editor.blocks.insertBlock({ type: "paragraph", content: "Sibling" }, card);
  indentBlocks(runtime, [sibling]);
  expect(editor.blocks.getParentId(sibling)).toBe(card);
  outdentBlocks(runtime, [sibling]);
  expect(editor.blocks.getParentId(sibling)).toBe(column.id);
  outdentBlocks(runtime, [sibling]);
  expect(editor.blocks.getParentId(sibling)).toBe(column.id);

  editor.blocks.moveBlocks([card], bento, "after");
  expect(editor.blocks.getParentId(card)).toBeNull();
  editor.history.undo();
  expect(editor.blocks.getParentId(card)).toBe(column.id);
  editor.blocks.moveBlocks([card], editor.blocks.getBlock(kanban)!.children[1]!.id, "inside");
  expect(editor.blocks.getParentId(card)).toBe(editor.blocks.getBlock(kanban)!.children[1]!.id);

  expect(runtime.views.resolve(bento).dropAxis).toBe("grid");
  expect(runtime.views.resolve(kanban).dropAxis).toBe("horizontal");
  expect(runtime.views.resolve(column.id).dropAxis).toBe("vertical");
  const fromPage = editor.blocks.insertBlock({ type: "paragraph", content: "From page" });
  editor.blocks.moveBlocks([fromPage], bento, "inside");
  expect(editor.blocks.getParentId(fromPage)).toBe(bento);
  runtime.destroy();
  editor.destroy();
});

test("bento inside bento keeps each board as its own floor", () => {
  const { editor, runtime } = createNestedRuntime();
  const outer = editor.blocks.insertBlock(createBentoBlockInput());
  const inner = editor.blocks.insertBlock(createBentoBlockInput());
  editor.blocks.moveBlocks([inner], outer, "inside");
  const tile = editor.blocks.insertBlock({ type: "paragraph", content: "Inner tile" });
  editor.blocks.moveBlocks([tile], inner, "inside");

  indentBlocks(runtime, [inner]);
  outdentBlocks(runtime, [inner]);
  expect(editor.blocks.getParentId(inner)).toBe(outer);
  indentBlocks(runtime, [tile]);
  outdentBlocks(runtime, [tile]);
  expect(editor.blocks.getParentId(tile)).toBe(inner);
  editor.blocks.moveBlocks([tile], outer, "after");
  expect(editor.blocks.getParentId(tile)).toBeNull();
  editor.history.undo();
  expect(editor.blocks.getParentId(tile)).toBe(inner);
  expect(runtime.views.has(BENTO_BLOCK_TYPE)).toBe(true);
  runtime.destroy();
  editor.destroy();
});

test("columns inside a kanban column allow indent under the lane only", () => {
  const { editor, runtime } = createNestedRuntime();
  const kanban = editor.blocks.insertBlock(createKanbanBlockInput());
  const column = editor.blocks.getBlock(kanban)!.children[0]!;
  const columns = editor.blocks.insertBlock(createColumnsBlockInput(2));
  editor.blocks.moveBlocks([columns], column.id, "inside");
  const lane = editor.blocks.getBlock(columns)!.children[0]!;
  const writing = editor.blocks.insertBlock({ type: "paragraph", content: "In lane" });
  editor.blocks.moveBlocks([writing], lane.id, "inside");

  indentBlocks(runtime, [lane.id]);
  expect(editor.blocks.getParentId(lane.id)).toBe(columns);
  const nested = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, writing);
  indentBlocks(runtime, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(writing);
  outdentBlocks(runtime, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(lane.id);
  outdentBlocks(runtime, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(lane.id);
  expect(getBlockContainment(editor.blocksRegistry.get("columns"))?.childOutline).toBe("fixed");
  expect(getBlockContainment(editor.blocksRegistry.get("columns-column"))?.outlineFloor).toBe(true);
  runtime.destroy();
  editor.destroy();
});

test("table inside a bento tile and bento inside a table cell compose floors", () => {
  const { editor, runtime } = createNestedRuntime();
  const bento = editor.blocks.insertBlock(createBentoBlockInput());
  const table = editor.blocks.insertBlock(createTableBlockInput(2, 2));
  editor.blocks.moveBlocks([table], bento, "inside");
  const cell = editor.blocks.getBlock(table)!.children[0]!.children[0]!;
  const innerBento = editor.blocks.insertBlock(createBentoBlockInput());
  editor.blocks.moveBlocks([innerBento], cell.id, "inside");
  const cellTile = editor.blocks.insertBlock({ type: "paragraph", content: "Cell tile" });
  editor.blocks.moveBlocks([cellTile], innerBento, "inside");

  outdentBlocks(runtime, [innerBento]);
  expect(editor.blocks.getParentId(innerBento)).toBe(cell.id);
  outdentBlocks(runtime, [cellTile]);
  expect(editor.blocks.getParentId(cellTile)).toBe(innerBento);
  const row = editor.blocks.getBlock(table)!.children[0]!;
  indentBlocks(runtime, [row.id]);
  expect(editor.blocks.getParentId(row.id)).toBe(table);
  expect(() => editor.blocks.moveBlocks([cell.id], table, "inside")).toThrow();
  expect(runtime.views.resolve(table).dropAxis).toBe("vertical");
  expect(getBlockContainment(editor.blocksRegistry.get(TABLE_CELL_BLOCK_TYPE))?.outlineFloor).toBe(true);
  expect(editor.blocks.getBlock(bento)?.type).toBe(BENTO_BLOCK_TYPE);
  expect(editor.blocks.getBlock(table)?.type).toBe(TABLE_BLOCK_TYPE);
  expect(editor.blocks.getBlock(cell.id)?.type).toBe(TABLE_CELL_BLOCK_TYPE);
  runtime.destroy();
  editor.destroy();
});
