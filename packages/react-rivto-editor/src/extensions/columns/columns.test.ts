/**
 * Checks that Columns uses the ordinary block hierarchy: nested identities
 * survive moves, shrinking the board relocates rather than deletes children,
 * and the result participates in undo and snapshots.
 * @module
 */
import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor } from "../../test-utils";
import { createReactEditor } from "../../react-editor";
import { defaultWritingBlockExtension } from "../page/default-writing-block";
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
  const runtime = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), columnsExtension()],
  });
  return { editor, runtime };
}

test("inserts equally sized columns and relocates nested blocks when a column is removed", () => {
  const { editor, runtime } = createColumnsRuntime();
  const before = editor.blocks.insertBlock({ type: "paragraph", content: "Before" });
  runtime.slashCommands.execute("block.columns.insert", { blockId: before });
  const board = editor.blocks.getBlocks().find((block) => block.type === COLUMNS_BLOCK_TYPE)!;
  expect(board.children).toHaveLength(2);
  expect(board.children.every((child) => child.type === COLUMNS_COLUMN_BLOCK_TYPE)).toBe(true);

  const left = board.children[0]!;
  const right = board.children[1]!;
  const keep = editor.blocks.insertBlock({ type: "paragraph", content: "Keep" });
  const moving = editor.blocks.insertBlock({
    type: "paragraph",
    content: "Moving",
    children: [{ type: "paragraph", content: "Detail" }],
  });
  editor.blocks.moveBlocks([keep], left.id, "inside");
  editor.blocks.moveBlocks([moving], right.id, "inside");
  const original = editor.blocks.getBlock(moving);

  editor.history.clear();
  expect(setColumnsCount(runtime, board.id, 1)).toBe(true);
  expect(editor.blocks.getBlock(board.id)?.children).toHaveLength(1);
  expect(editor.blocks.getBlock(left.id)?.children.map((child) => child.id)).toEqual([keep, moving]);
  expect(editor.blocks.getBlock(moving)).toEqual(original);
  expect(editor.blocks.getBlock(right.id)).toBeUndefined();

  editor.history.undo();
  expect(editor.blocks.getBlock(board.id)?.children.map((child) => child.id)).toEqual([left.id, right.id]);
  expect(editor.blocks.getBlock(right.id)?.children.map((child) => child.id)).toEqual([moving]);

  expect(setColumnsCount(runtime, board.id, 3)).toBe(true);
  expect(editor.blocks.getBlock(board.id)?.children).toHaveLength(3);

  const snapshot = editor.dump();
  editor.load(snapshot);
  expect(editor.dump()).toEqual(snapshot);
  const copied = editor.clipboard.copy(createStructuralSelection([board.id]));
  expect(copied?.blocks[0]?.children).toHaveLength(3);

  runtime.destroy();
  editor.destroy();
});

test("structural column deletion moves nested blocks instead of removing them", () => {
  const { editor, runtime } = createColumnsRuntime();
  const boardId = editor.blocks.insertBlock(createColumnsBlockInput(2));
  const [left, right] = editor.blocks.getBlock(boardId)!.children;
  const nested = editor.blocks.insertBlock({ type: "paragraph", content: "Survive" });
  editor.blocks.moveBlocks([nested], right!.id, "inside");

  relocateColumnContents(editor, [right!.id]);
  editor.blocks.removeBlock(right!.id);
  expect(editor.blocks.getBlock(left!.id)?.children.map((child) => child.id)).toEqual([nested]);
  expect(editor.blocks.getBlock(nested)?.content).toBe("Survive");

  runtime.destroy();
  editor.destroy();
});

test("validates requested column counts", () => {
  expect(() => createColumnsBlockInput(0)).toThrow("Columns count must be an integer from 1 to 6");
  expect(() => createColumnsBlockInput(7)).toThrow("Columns count must be an integer from 1 to 6");
  expect(createColumnsBlockInput(3).children).toHaveLength(3);
});
