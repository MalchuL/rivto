/**
 * Checks that Columns uses the ordinary block hierarchy: nested identities
 * survive moves, shrinking the board relocates rather than deletes children,
 * and the result participates in undo and snapshots.
 * @module
 */
import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor } from "../../../test-utils";
import { createReactEditor } from "../../../react-editor";
import { defaultWritingBlockExtension } from "../../built-ins/built-ins";
import {
  columnsExtension,
  createColumnsBlockInput,
  relocateColumnContents,
  setColumnsCount,
  COLUMNS_BLOCK_TYPE,
  COLUMNS_COLUMN_BLOCK_TYPE,
} from "./columns";

function createColumnsRuntime() {
  const editor = createTestCoreEditor();
  const reactEditor = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), columnsExtension()],
  });
  return { editor, reactEditor };
}

test("slash insert creates empty columns", () => {
  const { editor, reactEditor } = createColumnsRuntime();
  const before = editor.blocks.insertBlock({ type: "paragraph", content: "" }).id;
  reactEditor.slashCommands.execute("block.columns.insert", { blockId: before });
  const board = editor.blocks.getBlock(before)!;
  expect(board.id).toBe(before);
  expect(board.type).toBe(COLUMNS_BLOCK_TYPE);
  expect(board.content).toBe("");
  expect(board.children).toHaveLength(2);
  expect(board.children.every((child) => child.type === COLUMNS_COLUMN_BLOCK_TYPE)).toBe(true);
  expect(board.children.every((column) => column.children.length === 0)).toBe(true);
  reactEditor.destroy();
  editor.destroy();
});

test("inserts equally sized columns and relocates nested blocks when a column is removed", () => {
  const { editor, reactEditor } = createColumnsRuntime();
  const boardId = editor.blocks.insertBlock(createColumnsBlockInput(2)).id;
  const board = editor.blocks.getBlock(boardId)!;
  expect(board.children).toHaveLength(2);
  expect(board.children.every((child) => child.type === COLUMNS_COLUMN_BLOCK_TYPE)).toBe(true);

  const left = board.children[0]!;
  const right = board.children[1]!;
  const keep = editor.blocks.insertBlock({ type: "paragraph", content: "Keep" }).id;
  const moving = editor.blocks.insertBlock({
    type: "paragraph",
    content: "Moving",
    children: [{ type: "paragraph", content: "Detail" }],
  }).id;
  editor.blocks.moveBlocks([keep], left.id, "inside");
  editor.blocks.moveBlocks([moving], right.id, "inside");
  const original = editor.blocks.getBlock(moving);

  editor.history.clear();
  expect(setColumnsCount(reactEditor, board.id, 1)).toBe(true);
  expect(editor.blocks.getBlock(board.id)?.children).toHaveLength(1);
  expect(editor.blocks.getBlock(left.id)?.children.map((child) => child.id)).toEqual([keep, moving]);
  expect(editor.blocks.getBlock(moving)).toEqual(original);
  expect(editor.blocks.hasBlock(right.id)).toBe(false);

  editor.history.undo();
  expect(editor.blocks.getBlock(board.id)?.children.map((child) => child.id)).toEqual([left.id, right.id]);
  expect(editor.blocks.getBlock(right.id)?.children.map((child) => child.id)).toEqual([moving]);

  expect(setColumnsCount(reactEditor, board.id, 3)).toBe(true);
  expect(editor.blocks.getBlock(board.id)?.children).toHaveLength(3);
  expect(editor.blocks.getBlock(board.id)?.children[2]?.children).toHaveLength(0);

  const snapshot = editor.dump();
  editor.load(snapshot);
  expect(editor.dump()).toEqual(snapshot);
  const copied = editor.clipboard.copy(createStructuralSelection([board.id]));
  expect(copied?.blocks[0]?.children).toHaveLength(3);

  reactEditor.destroy();
  editor.destroy();
});

test("structural column deletion moves nested blocks instead of removing them", () => {
  const { editor, reactEditor } = createColumnsRuntime();
  const boardId = editor.blocks.insertBlock(createColumnsBlockInput(2)).id;
  const [left, right] = editor.blocks.getBlock(boardId)!.children;
  const nested = editor.blocks.insertBlock({ type: "paragraph", content: "Survive" }).id;
  editor.blocks.moveBlocks([nested], right!.id, "inside");

  relocateColumnContents(editor, [right!.id]);
  editor.blocks.removeBlock(right!.id);
  expect(editor.blocks.getBlock(left!.id)?.children.map((child) => child.id)).toEqual([nested]);
  expect(editor.blocks.getBlockNode(nested)?.content).toBe("Survive");

  reactEditor.destroy();
  editor.destroy();
});

test("validates requested column counts", () => {
  expect(() => createColumnsBlockInput(0)).toThrow("Columns count must be an integer from 1 to 6");
  expect(() => createColumnsBlockInput(7)).toThrow("Columns count must be an integer from 1 to 6");
  expect(createColumnsBlockInput(3).children).toHaveLength(3);
});
