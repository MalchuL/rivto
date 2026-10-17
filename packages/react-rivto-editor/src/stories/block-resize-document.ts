import type { ReactEditorApi } from "../editor/types";
import { createBentoBlockInput } from "../extensions/containers/bento/bento";
import { createColumnsBlockInput } from "../extensions/containers/columns/columns";
import { createKanbanBlockInput } from "../extensions/containers/kanban/kanban";
import { createTableBlockInput } from "../extensions/containers/table/table";
import { TODO_ITEM_BLOCK_TYPE, createTodoItemProps } from "../extensions/todo-item/todo-item-model";
import { TODO_STORAGE_BLOCK_TYPE } from "../extensions/todo-item/todo-storage";

const WRAP_SAMPLE = `WrapSample ${"adaptive ".repeat(36)}`;
const TOKEN_SAMPLE = `TokenSample ${"UnbrokenToken".repeat(8)}`;
const TABLE_SAMPLE = [
  "| Name | Notes |",
  "| --- | --- |",
  `| Alpha | ${"cell ".repeat(16)} |`,
  `| Beta | https://example.com/${"segment".repeat(8)} |`,
].join("\n");
const CODE_SAMPLE = `\`\`\`text\nconst value = "${"x".repeat(80)}";\n\`\`\``;

/**
 * Inserts writing blocks that must wrap, scroll internally, or stay in the column.
 *
 * @param editor - Ready editor whose document is still empty.
 * @returns Nothing after the writing samples are inserted.
 */
function seedWriting(editor: ReactEditorApi): void {
  editor.blocks.insertBlock({ type: "paragraph", content: WRAP_SAMPLE });
  editor.blocks.insertBlock({ type: "paragraph", content: TOKEN_SAMPLE });
  editor.blocks.insertBlock({ type: "paragraph", content: TABLE_SAMPLE });
  editor.blocks.insertBlock({ type: "paragraph", content: CODE_SAMPLE });
  editor.blocks.insertBlock({
    type: "paragraph",
    content: `Checked parent ${"item ".repeat(12)}`,
    listProps: { type: "checkbox" },
    children: [{ type: "paragraph", content: `Nested child ${"detail ".repeat(16)}` }],
  });
  editor.blocks.insertBlock({
    type: "paragraph",
    content: `Numbered ${"entry ".repeat(14)}`,
    listProps: { type: "numbered_list" },
  });
  editor.blocks.insertBlock({ type: "separator", content: "" });
}

/**
 * Inserts column, kanban, bento, and table samples with long nested text.
 *
 * @param editor - Ready editor receiving container subtrees after the writing samples.
 * @returns Nothing after the containers are inserted.
 */
function seedContainers(editor: ReactEditorApi): void {
  editor.blocks.insertBlock(
    createColumnsBlockInput(3, {
      type: "paragraph",
      content: `ColumnWrapSample ${"lane ".repeat(18)}`,
    }),
  );
  const board = editor.blocks.insertBlock(createKanbanBlockInput());
  for (const column of board.children) {
    editor.blocks.insertBlock(
      { type: "paragraph", content: `Card ${"detail ".repeat(14)}` },
      { parentId: column.id },
    );
  }
  const bento = editor.blocks.insertBlock(createBentoBlockInput());
  editor.blocks.insertBlock(
    {
      type: "paragraph",
      content: `Tile ${"wide ".repeat(20)}`,
      props: { bentoWidth: 480 },
    },
    { parentId: bento.id },
  );
  const table = editor.blocks.insertBlock(createTableBlockInput(2, 3, 160));
  for (const row of table.children) {
    for (const cell of row.children) {
      editor.blocks.insertBlock(
        { type: "paragraph", content: `Cell ${"value ".repeat(10)}` },
        { parentId: cell.id },
      );
    }
  }
}

/**
 * Inserts a TODO storage row whose name, project, and toolbar must stay inside the column.
 *
 * @param editor - Ready editor receiving the TODO sample.
 * @returns Nothing after the storage and its item are inserted.
 */
function seedTodos(editor: ReactEditorApi): void {
  const storage = editor.blocks.insertBlock({ type: TODO_STORAGE_BLOCK_TYPE, content: "" });
  editor.blocks.insertBlock(
    {
      type: TODO_ITEM_BLOCK_TYPE,
      content: `TodoWrapSample ${"task ".repeat(16)} ${"X".repeat(48)}`,
      props: {
        ...createTodoItemProps(),
        description: `Description ${"note ".repeat(12)}`,
        project: "VeryLongProjectNameWithoutSpaces",
      },
    },
    { parentId: storage.id },
  );
}

/**
 * Seeds every current built-in block family used by the resize stories.
 *
 * The editor must be empty. Each call inserts a new copy, so the story seeds
 * once per constructed editor.
 *
 * @param editor - Ready React editor bound to an empty document.
 * @returns Nothing after writing blocks, containers, and the TODO sample exist.
 */
export function seedResizeDocument(editor: ReactEditorApi): void {
  seedWriting(editor);
  seedContainers(editor);
  seedTodos(editor);
}
