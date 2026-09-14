/**
 * Checks Kanban's use of the ordinary block hierarchy: insertion and moves retain
 * card identities and descendants, and participate in document history.
 * @module
 */
import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor } from "../../../test-utils";
import { createReactEditor } from "../../../react-editor";
import { defaultWritingBlockExtension } from "../page/default-writing-block";
import { kanbanExtension, KANBAN_BLOCK_TYPE } from "./kanban";
import { indentBlocks, outdentBlocks } from "../../../views/ops/outline-ops";

test("moves existing subtrees into, between and out of Kanban columns with undo", () => {
  const editor = createTestCoreEditor();
  const runtime = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), kanbanExtension()],
  });
  const boardId = editor.blocks.insertBlock({ type: "paragraph", content: "" });
  runtime.slashCommands.execute("block.kanban.insert", { blockId: boardId });
  const board = editor.blocks.getBlock(boardId)!;
  expect(board.id).toBe(boardId);
  expect(board.content).toBe("");
  expect(board.children.map((block) => block.content)).toEqual(["To do", "In progress", "Done"]);
  const card = editor.blocks.insertBlock({
    type: "paragraph", content: "Card", children: [{ type: "paragraph", content: "Detail" }],
  }, board.id);
  const original = editor.blocks.getBlock(card);
  editor.blocks.moveBlocks([card], board.children[0]!.id, "inside");
  expect(editor.blocks.getBlock(board.children[0]!.id)!.children).toEqual([original]);
  editor.blocks.moveBlocks([card], board.children[1]!.id, "inside");
  expect(editor.blocks.getBlock(board.children[0]!.id)!.children).toEqual([]);
  expect(editor.blocks.getBlock(board.children[1]!.id)!.children).toEqual([original]);
  editor.history.clear();
  editor.blocks.moveBlocks([card], board.id, "after");
  expect(editor.blocks.getParentId(card)).toBeNull();
  editor.history.undo();
  expect(editor.blocks.getBlock(board.children[1]!.id)!.children).toEqual([original]);
  outdentBlocks(runtime, [card]);
  expect(editor.blocks.getParentId(card)).toBe(board.children[1]!.id);
  const nested = editor.blocks.insertBlock({ type: "paragraph", content: "Nested" }, card);
  indentBlocks(runtime, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(card);
  outdentBlocks(runtime, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(board.children[1]!.id);
  const copied = editor.clipboard.copy(createStructuralSelection([board.id]));
  expect(copied?.blocks[0]?.children[1]?.children[0]?.id).toBe(card);
  const snapshot = editor.dump();
  editor.load(snapshot);
  expect(editor.dump()).toEqual(snapshot);
  runtime.destroy();
  editor.destroy();
});
