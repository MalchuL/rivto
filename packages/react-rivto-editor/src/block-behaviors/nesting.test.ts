import { createTestReactEditor as createReactEditor } from "../test-utils";
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

import { defaultWritingBlockExtension } from "../extensions/built-ins/built-ins";
import { BENTO_BLOCK_TYPE, bentoExtension, createBentoBlockInput } from "../extensions/containers/bento/bento";
import { columnsExtension, createColumnsBlockInput } from "../extensions/containers/columns/columns";
import { createKanbanBlockInput, kanbanExtension } from "../extensions/containers/kanban/kanban";
import { createTableBlockInput, TABLE_BLOCK_TYPE, TABLE_CELL_BLOCK_TYPE, tableExtension } from "../extensions/containers/table/table";
import { getBlockContainment } from "../managers/blocks/types";
import { indentBlocks, outdentBlocks } from "./ops/outline-ops";

async function createNestedRuntime() {
  const editor = await createTestCoreEditor();
  const editorView = createReactEditor({
    editor,
    extensions: [
      defaultWritingBlockExtension(),
      bentoExtension(),
      kanbanExtension(),
      columnsExtension(),
      tableExtension(),
    ],
  });
  return { editor, editorView };
}

test("kanban inside bento freezes tiles and floors cards at the column", async () => {
  const { editor, editorView } = await createNestedRuntime();
  const bento = editor.blocks.insertBlock(createBentoBlockInput()).id;
  const kanban = editor.blocks.insertBlock(createKanbanBlockInput()).id;
  editor.blocks.moveBlocks([kanban], bento, "inside");
  const column = editor.blocks.getBlock(kanban)!.children[0]!;
  const card = editor.blocks.insertBlock({ type: "paragraph", content: "Card" }).id;
  editor.blocks.moveBlocks([card], column.id, "inside");

  expect(editor.blocks.getParentId(kanban)).toBe(bento);
  indentBlocks(editorView, [kanban]);
  outdentBlocks(editorView, [kanban]);
  expect(editor.blocks.getParentId(kanban)).toBe(bento);

  expect(editor.blocks.getParentId(column.id)).toBe(kanban);
  indentBlocks(editorView, [column.id]);
  expect(editor.blocks.getParentId(column.id)).toBe(kanban);

  const sibling = editor.blocks.insertBlock({ type: "paragraph", content: "Sibling" }, card).id;
  indentBlocks(editorView, [sibling]);
  expect(editor.blocks.getParentId(sibling)).toBe(card);
  outdentBlocks(editorView, [sibling]);
  expect(editor.blocks.getParentId(sibling)).toBe(column.id);
  outdentBlocks(editorView, [sibling]);
  expect(editor.blocks.getParentId(sibling)).toBe(column.id);

  editor.blocks.moveBlocks([card], bento, "after");
  expect(editor.blocks.getParentId(card)).toBeNull();
  editor.history.undo();
  expect(editor.blocks.getParentId(card)).toBe(column.id);
  editor.blocks.moveBlocks([card], editor.blocks.getBlock(kanban)!.children[1]!.id, "inside");
  expect(editor.blocks.getParentId(card)).toBe(editor.blocks.getBlock(kanban)!.children[1]!.id);

  expect(editorView.runtime.blockBehaviors.resolve(bento).dropAxis).toBe("grid");
  expect(editorView.runtime.blockBehaviors.resolve(kanban).dropAxis).toBe("horizontal");
  expect(editorView.runtime.blockBehaviors.resolve(column.id).dropAxis).toBe("vertical");
  const fromPage = editor.blocks.insertBlock({ type: "paragraph", content: "From page" }).id;
  editor.blocks.moveBlocks([fromPage], bento, "inside");
  expect(editor.blocks.getParentId(fromPage)).toBe(bento);
  editorView.runtime.destroy();
  editor.destroy();
});

test("bento inside bento keeps each board as its own floor", async () => {
  const { editor, editorView } = await createNestedRuntime();
  const outer = editor.blocks.insertBlock(createBentoBlockInput()).id;
  const inner = editor.blocks.insertBlock(createBentoBlockInput()).id;
  editor.blocks.moveBlocks([inner], outer, "inside");
  const tile = editor.blocks.insertBlock({ type: "paragraph", content: "Inner tile" }).id;
  editor.blocks.moveBlocks([tile], inner, "inside");

  indentBlocks(editorView, [inner]);
  outdentBlocks(editorView, [inner]);
  expect(editor.blocks.getParentId(inner)).toBe(outer);
  indentBlocks(editorView, [tile]);
  outdentBlocks(editorView, [tile]);
  expect(editor.blocks.getParentId(tile)).toBe(inner);
  editor.blocks.moveBlocks([tile], outer, "after");
  expect(editor.blocks.getParentId(tile)).toBeNull();
  editor.history.undo();
  expect(editor.blocks.getParentId(tile)).toBe(inner);
  expect(editorView.runtime.blockBehaviors.has(BENTO_BLOCK_TYPE)).toBe(true);
  editorView.runtime.destroy();
  editor.destroy();
});

test("columns inside a kanban column allow indent under the lane only", async () => {
  const { editor, editorView } = await createNestedRuntime();
  const kanban = editor.blocks.insertBlock(createKanbanBlockInput()).id;
  const column = editor.blocks.getBlock(kanban)!.children[0]!;
  const columns = editor.blocks.insertBlock(createColumnsBlockInput(2)).id;
  editor.blocks.moveBlocks([columns], column.id, "inside");
  const lane = editor.blocks.getBlock(columns)!.children[0]!;
  const writing = editor.blocks.insertBlock({ type: "paragraph", content: "In lane" }).id;
  editor.blocks.moveBlocks([writing], lane.id, "inside");

  indentBlocks(editorView, [lane.id]);
  expect(editor.blocks.getParentId(lane.id)).toBe(columns);
  const nested = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, writing).id;
  indentBlocks(editorView, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(writing);
  outdentBlocks(editorView, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(lane.id);
  outdentBlocks(editorView, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(lane.id);
  expect(getBlockContainment(editor.blockRegistry.get("columns"))?.childOutline).toBe("fixed");
  expect(getBlockContainment(editor.blockRegistry.get("columns-column"))?.outlineFloor).toBe(true);
  expect(editorView.runtime.blockBehaviors.resolve(columns).dropAxis).toBe("horizontal");
  editorView.runtime.destroy();
  editor.destroy();
});

test("table inside a bento tile and bento inside a table cell compose floors", async () => {
  const { editor, editorView } = await createNestedRuntime();
  const bento = editor.blocks.insertBlock(createBentoBlockInput()).id;
  const table = editor.blocks.insertBlock(createTableBlockInput(2, 2)).id;
  editor.blocks.moveBlocks([table], bento, "inside");
  const cell = editor.blocks.getBlock(table)!.children[0]!.children[0]!;
  const innerBento = editor.blocks.insertBlock(createBentoBlockInput()).id;
  editor.blocks.moveBlocks([innerBento], cell.id, "inside");
  const cellTile = editor.blocks.insertBlock({ type: "paragraph", content: "Cell tile" }).id;
  editor.blocks.moveBlocks([cellTile], innerBento, "inside");

  outdentBlocks(editorView, [innerBento]);
  expect(editor.blocks.getParentId(innerBento)).toBe(cell.id);
  outdentBlocks(editorView, [cellTile]);
  expect(editor.blocks.getParentId(cellTile)).toBe(innerBento);
  const row = editor.blocks.getBlock(table)!.children[0]!;
  indentBlocks(editorView, [row.id]);
  expect(editor.blocks.getParentId(row.id)).toBe(table);
  outdentBlocks(editorView, [cell.id]);
  expect(editor.blocks.getParentId(cell.id)).toBe(row.id);
  expect(editorView.runtime.blockBehaviors.resolve(table).dropAxis).toBe("vertical");
  expect(getBlockContainment(editor.blockRegistry.get(TABLE_CELL_BLOCK_TYPE))?.outlineFloor).toBe(true);
  expect(editor.blocks.getBlockNode(bento)?.type).toBe(BENTO_BLOCK_TYPE);
  expect(editor.blocks.getBlockNode(table)?.type).toBe(TABLE_BLOCK_TYPE);
  expect(editor.blocks.getBlockNode(cell.id)?.type).toBe(TABLE_CELL_BLOCK_TYPE);
  editorView.runtime.destroy();
  editor.destroy();
});
