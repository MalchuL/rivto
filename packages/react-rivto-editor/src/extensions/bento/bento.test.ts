/**
 * Verifies Bento uses ordinary persisted hierarchy and props, including undo,
 * clipboard and snapshot round trips rather than a separate tile store.
 * @module
 */
import { createTestCoreEditor } from "../../test-utils";
import { createReactEditor } from "../../react-editor";
import { defaultWritingBlockExtension } from "../page/default-writing-block";
import { bentoExtension, createBentoBlockInput } from "./bento";

test("Bento preserves tile identity and width through moves, undo and serialization", () => {
  const editor = createTestCoreEditor();
  const runtime = createReactEditor({ editor, extensions: [defaultWritingBlockExtension(), bentoExtension()] });
  const board = editor.blocks.insertBlock(createBentoBlockInput());
  const tile = editor.blocks.insertBlock({ type: "paragraph", content: "Tile", props: { bentoWidth: 440 } });
  editor.blocks.moveBlocks([tile], board, "inside");
  editor.history.clear();
  editor.blocks.updateBlock(tile, { props: { bentoWidth: 600 } });
  editor.history.undo();
  expect(editor.blocks.getBlock(tile)?.props.bentoWidth).toBe(440);
  const copy = editor.clipboard.copy([{ type: "block", blockIds: [board], anchorBlockId: board, focusBlockId: board }]);
  expect(copy?.blocks[0]?.children[0]?.props.bentoWidth).toBe(440);
  const snapshot = editor.dump();
  editor.load(snapshot);
  expect(editor.dump()).toEqual(snapshot);
  editor.blocks.moveBlocks([tile], board, "after");
  expect(editor.blocks.getRootIds()).toContain(tile);
  expect(editor.blocks.getBlock(tile)?.props.bentoWidth).toBe(440);
  runtime.destroy();
  editor.destroy();
});
