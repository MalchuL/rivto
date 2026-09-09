/**
 * Checks Kanban's use of the ordinary block hierarchy: insertion and moves retain
 * card identities and descendants, and participate in document history.
 * @module
 */
import { createTestCoreEditor } from "../../test-utils";
import { createReactEditor } from "../../react-editor";
import { defaultWritingBlockExtension } from "../page/default-writing-block";
import { kanbanExtension, KANBAN_BLOCK_TYPE } from "./kanban";

test("moves existing subtrees into, between and out of Kanban columns with undo", () => {
  const editor = createTestCoreEditor();
  const runtime = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), kanbanExtension()],
  });
  const card = editor.blocks.insertBlock({
    type: "paragraph", content: "Card", children: [{ type: "paragraph", content: "Detail" }],
  });
  runtime.slashCommands.execute("block.kanban.insert", { blockId: card });
  const board = editor.blocks.getBlocks().find((block) => block.type === KANBAN_BLOCK_TYPE)!;
  expect(board.children.map((block) => block.content)).toEqual(["To do", "In progress", "Done"]);
  const original = editor.blocks.getBlock(card);
  editor.blocks.moveBlocks([card], board.children[0]!.id, "inside");
  expect(editor.blocks.getBlock(board.children[0]!.id)!.children).toEqual([original]);
  editor.blocks.moveBlocks([card], board.children[1]!.id, "inside");
  expect(editor.blocks.getBlock(board.children[0]!.id)!.children).toEqual([]);
  expect(editor.blocks.getBlock(board.children[1]!.id)!.children).toEqual([original]);
  editor.history.clear();
  editor.blocks.moveBlocks([card], board.id, "after");
  expect(editor.blocks.getRootIds()).toContain(card);
  expect(editor.blocks.getBlock(card)).toEqual(original);
  editor.history.undo();
  expect(editor.blocks.getBlock(board.children[1]!.id)!.children).toEqual([original]);
  const copied = editor.clipboard.copy([{
    type: "block", blockIds: [board.id], anchorBlockId: board.id, focusBlockId: board.id,
  }]);
  expect(copied?.blocks[0]?.children[1]?.children[0]?.id).toBe(card);
  const snapshot = editor.dump();
  editor.load(snapshot);
  expect(editor.dump()).toEqual(snapshot);
  runtime.destroy();
  editor.destroy();
});
