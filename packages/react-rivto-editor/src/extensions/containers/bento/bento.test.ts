/**
 * Verifies Bento uses ordinary persisted hierarchy and props, including undo,
 * clipboard and snapshot round trips rather than a separate tile store.
 * @module
 */
import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor } from "../../../test-utils";
import { createReactEditor } from "../../../react-editor";
import { defaultWritingBlockExtension } from "../../built-ins/built-ins";
import { bentoExtension, createBentoBlockInput } from "./bento";
import { indentBlocks } from "../../../views/ops/outline-ops";

test("slash converts the current block to Bento in place", () => {
  const editor = createTestCoreEditor();
  const reactEditor = createReactEditor({ editor, extensions: [defaultWritingBlockExtension(), bentoExtension()] });
  const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "" });
  reactEditor.slashCommands.execute("block.bento.insert", { blockId });
  expect(editor.blocks.getBlock(blockId)).toMatchObject({ id: blockId, type: "bento", content: "" });
  reactEditor.destroy();
  editor.destroy();
});

test("Bento preserves tile identity and width through moves, undo and serialization", () => {
  const editor = createTestCoreEditor();
  const reactEditor = createReactEditor({ editor, extensions: [defaultWritingBlockExtension(), bentoExtension()] });
  const board = editor.blocks.insertBlock(createBentoBlockInput());
  expect(editor.blocks.getBlock(board)?.content).toBe("");
  const tile = editor.blocks.insertBlock({ type: "paragraph", content: "Tile", props: { bentoWidth: 440 } });
  editor.blocks.moveBlocks([tile], board, "inside");
  editor.history.clear();
  editor.blocks.updateBlock(tile, { props: { bentoWidth: 600 } });
  editor.history.undo();
  expect(editor.blocks.getBlock(tile)?.props.bentoWidth).toBe(440);
  const copy = editor.clipboard.copy(createStructuralSelection([board]));
  expect(copy?.blocks[0]?.children[0]?.props.bentoWidth).toBe(440);
  const snapshot = editor.dump();
  editor.load(snapshot);
  expect(editor.dump()).toEqual(snapshot);
  editor.history.clear();
  editor.blocks.moveBlocks([tile], board, "after");
  expect(editor.blocks.getParentId(tile)).toBeNull();
  editor.history.undo();
  expect(editor.blocks.getParentId(tile)).toBe(board);
  const nested = editor.blocks.insertBlock({ type: "paragraph", content: "Other" });
  editor.blocks.moveBlocks([nested], board, "inside");
  indentBlocks(reactEditor, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(board);
  editor.blocks.indentBlock(nested);
  expect(editor.blocks.getParentId(nested)).toBe(tile);
  reactEditor.destroy();
  editor.destroy();
});
