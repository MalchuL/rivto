import type { ReactPanelApi } from "../panels/types";
import { BentoBehavior } from "../extensions/containers/bento/bento-behavior";
import {
  createTestReactEditor as createReactEditor,
  createTestCoreEditor,
  indentBlocks,
  outdentBlocks,
} from "../test-utils";
/**
 * Nested container matrix: kanban in bento, bento in bento, columns in a
 * kanban column, table in a bento tile, and bento in a table cell.
 *
 * Each case checks Tab/Shift+Tab at every relevant depth and a lateral move
 * that must remain legal. Concrete parent behavior handlers own outline restrictions. Explicit
 * drag/`moveBlocks` may leave a floor.
 *
 * @module
 */

import { defaultWritingBlockExtension } from "../extensions/built-ins/built-ins";
import {
  BENTO_BLOCK_TYPE,
  bentoExtension,
  createBentoBlockInput,
} from "../extensions/containers/bento/bento";
import {
  columnsExtension,
  createColumnsBlockInput,
} from "../extensions/containers/columns/columns";
import { createKanbanBlockInput, kanbanExtension } from "../extensions/containers/kanban/kanban";
import {
  createTableBlockInput,
  TABLE_BLOCK_TYPE,
  TABLE_CELL_BLOCK_TYPE,
  tableExtension,
} from "../extensions/containers/table/table";

async function createNestedRuntime() {
  const editor = await createTestCoreEditor({ registerWritingBlock: false });
  const reactPanel = createReactEditor({
    editor,
    extensions: [
      defaultWritingBlockExtension(),
      bentoExtension(),
      kanbanExtension(),
      columnsExtension(),
      tableExtension(),
    ],
  });
  return { editor, reactPanel };
}

test("kanban inside bento freezes tiles and floors cards at the column", async () => {
  const { editor, reactPanel } = await createNestedRuntime();
  const bento = editor.blocks.insertBlock(createBentoBlockInput()).id;
  const kanban = editor.blocks.insertBlock(createKanbanBlockInput()).id;
  editor.blocks.moveBlocks([kanban], bento, "inside");
  const column = editor.blocks.getBlock(kanban)!.children[0]!;
  const card = editor.blocks.insertBlock({ type: "paragraph", content: "Card" }).id;
  editor.blocks.moveBlocks([card], column.id, "inside");

  expect(editor.blocks.getParentId(kanban)).toBe(bento);
  indentBlocks(reactPanel, [kanban]);
  outdentBlocks(reactPanel, [kanban]);
  expect(editor.blocks.getParentId(kanban)).toBe(bento);

  expect(editor.blocks.getParentId(column.id)).toBe(kanban);
  indentBlocks(reactPanel, [column.id]);
  expect(editor.blocks.getParentId(column.id)).toBe(kanban);

  const sibling = editor.blocks.insertBlock(
    { type: "paragraph", content: "Sibling" },
    editor.blocks.getInsertionDestinationAfter(card),
  ).id;
  indentBlocks(reactPanel, [sibling]);
  expect(editor.blocks.getParentId(sibling)).toBe(card);
  outdentBlocks(reactPanel, [sibling]);
  expect(editor.blocks.getParentId(sibling)).toBe(column.id);
  outdentBlocks(reactPanel, [sibling]);
  expect(editor.blocks.getParentId(sibling)).toBe(column.id);

  editor.blocks.moveBlocks([card], bento, "after");
  expect(editor.blocks.getParentId(card)).toBeNull();
  editor.history.undo();
  expect(editor.blocks.getParentId(card)).toBe(column.id);
  editor.blocks.moveBlocks([card], editor.blocks.getBlock(kanban)!.children[1]!.id, "inside");
  expect(editor.blocks.getParentId(card)).toBe(editor.blocks.getBlock(kanban)!.children[1]!.id);

  const fromPage = editor.blocks.insertBlock({ type: "paragraph", content: "From page" }).id;
  editor.blocks.moveBlocks([fromPage], bento, "inside");
  expect(editor.blocks.getParentId(fromPage)).toBe(bento);
  reactPanel.editor.destroy();
  editor.destroy();
});

test("bento inside bento keeps each board as its own floor", async () => {
  const { editor, reactPanel } = await createNestedRuntime();
  const outer = editor.blocks.insertBlock(createBentoBlockInput()).id;
  const inner = editor.blocks.insertBlock(createBentoBlockInput()).id;
  editor.blocks.moveBlocks([inner], outer, "inside");
  const tile = editor.blocks.insertBlock({ type: "paragraph", content: "Inner tile" }).id;
  editor.blocks.moveBlocks([tile], inner, "inside");

  indentBlocks(reactPanel, [inner]);
  outdentBlocks(reactPanel, [inner]);
  expect(editor.blocks.getParentId(inner)).toBe(outer);
  indentBlocks(reactPanel, [tile]);
  outdentBlocks(reactPanel, [tile]);
  expect(editor.blocks.getParentId(tile)).toBe(inner);
  editor.blocks.moveBlocks([tile], outer, "after");
  expect(editor.blocks.getParentId(tile)).toBeNull();
  editor.history.undo();
  expect(editor.blocks.getParentId(tile)).toBe(inner);
  expect(
    reactPanel.editor.blockBehaviors
      .resolveAll({
        editor: reactPanel.editor,
        block: editor.blocks.getBlockNode(outer)!,
      })
      .some((behavior) => behavior instanceof BentoBehavior),
  ).toBe(true);
  reactPanel.editor.destroy();
  editor.destroy();
});

test("columns inside a kanban column allow indent under the lane only", async () => {
  const { editor, reactPanel } = await createNestedRuntime();
  const kanban = editor.blocks.insertBlock(createKanbanBlockInput()).id;
  const column = editor.blocks.getBlock(kanban)!.children[0]!;
  const columns = editor.blocks.insertBlock(createColumnsBlockInput(2)).id;
  editor.blocks.moveBlocks([columns], column.id, "inside");
  const lane = editor.blocks.getBlock(columns)!.children[0]!;
  const writing = editor.blocks.insertBlock({ type: "paragraph", content: "In lane" }).id;
  editor.blocks.moveBlocks([writing], lane.id, "inside");

  indentBlocks(reactPanel, [lane.id]);
  expect(editor.blocks.getParentId(lane.id)).toBe(columns);
  const nested = editor.blocks.insertBlock(
    { type: "paragraph", content: "Child" },
    editor.blocks.getInsertionDestinationAfter(writing),
  ).id;
  indentBlocks(reactPanel, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(writing);
  outdentBlocks(reactPanel, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(lane.id);
  outdentBlocks(reactPanel, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(lane.id);
  expectParentOutdentRejected(reactPanel, lane.id);
  reactPanel.editor.destroy();
  editor.destroy();
});

test("table inside a bento tile and bento inside a table cell compose floors", async () => {
  const { editor, reactPanel } = await createNestedRuntime();
  const bento = editor.blocks.insertBlock(createBentoBlockInput()).id;
  const table = editor.blocks.insertBlock(createTableBlockInput(2, 2)).id;
  editor.blocks.moveBlocks([table], bento, "inside");
  const cell = editor.blocks.getBlock(table)!.children[0]!.children[0]!;
  const innerBento = editor.blocks.insertBlock(createBentoBlockInput()).id;
  editor.blocks.moveBlocks([innerBento], cell.id, "inside");
  const cellTile = editor.blocks.insertBlock({ type: "paragraph", content: "Cell tile" }).id;
  editor.blocks.moveBlocks([cellTile], innerBento, "inside");

  outdentBlocks(reactPanel, [innerBento]);
  expect(editor.blocks.getParentId(innerBento)).toBe(cell.id);
  outdentBlocks(reactPanel, [cellTile]);
  expect(editor.blocks.getParentId(cellTile)).toBe(innerBento);
  const row = editor.blocks.getBlock(table)!.children[0]!;
  indentBlocks(reactPanel, [row.id]);
  expect(editor.blocks.getParentId(row.id)).toBe(table);
  outdentBlocks(reactPanel, [cell.id]);
  expect(editor.blocks.getParentId(cell.id)).toBe(row.id);
  expectParentOutdentRejected(reactPanel, cell.id);
  expect(editor.blocks.getBlockNode(bento)?.type).toBe(BENTO_BLOCK_TYPE);
  expect(editor.blocks.getBlockNode(table)?.type).toBe(TABLE_BLOCK_TYPE);
  expect(editor.blocks.getBlockNode(cell.id)?.type).toBe(TABLE_CELL_BLOCK_TYPE);
  reactPanel.editor.destroy();
  editor.destroy();
});

/**
 * Confirms native parent behavior rejects lifting its direct children.
 *
 * @param panel - Headless occurrence whose native behavior chain is queried.
 * @param id - Container identity supplying the former outline-floor policy.
 * @returns After asserting the parent's explicit rejection outcome.
 */
function expectParentOutdentRejected(panel: ReactPanelApi, id: string): void {
  const block = panel.blocks.getBlockNode(id)!;
  const behavior = panel.editor.blockBehaviors
    .resolveAll({ editor: panel.editor, block })
    .find((candidate) => candidate.onChildOutdent);
  expect(
    behavior?.onChildOutdent?.(
      {
        reactPanel: panel,
        block,
        parentId: panel.blocks.getParentId(id) ?? null,
        selection: undefined,
      },
      block.childIds,
    ),
  ).toBe("rejected");
}
