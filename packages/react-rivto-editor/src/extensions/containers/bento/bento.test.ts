import {
  createTestReactEditor as createReactEditor,
  createTestCoreEditor,
  indentBlocks,
} from "../../../test-utils";
/**
 * Verifies Bento uses ordinary persisted hierarchy and props, including undo,
 * clipboard and snapshot round trips rather than a separate tile store.
 * @module
 */
import { createStructuralSelection } from "@chulane/rivto";

import { defaultWritingBlockExtension } from "../../built-ins/built-ins";
import { bentoExtension, createBentoBlockInput } from "./bento";
import { restoreBentoSize } from "./bento-behavior";

test("slash converts the current block to Bento in place", async () => {
  const editor = await createTestCoreEditor({ registerWritingBlock: false });
  const reactPanel = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), bentoExtension()],
  });
  const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "" }).id;
  reactPanel.slashCommands.execute("block.bento.insert", { blockId });
  expect(editor.blocks.getBlockNode(blockId)).toMatchObject({
    id: blockId,
    type: "bento",
    content: "",
  });
  reactPanel.editor.destroy();
  editor.destroy();
});

test("Bento preserves tile identity and width through moves, undo and serialization", async () => {
  const editor = await createTestCoreEditor({ registerWritingBlock: false });
  const reactPanel = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), bentoExtension()],
  });
  const board = editor.blocks.insertBlock(createBentoBlockInput()).id;
  expect(editor.blocks.getBlockNode(board)?.content).toBe("");
  const tile = editor.blocks.insertBlock({
    type: "paragraph",
    content: "Tile",
    pluginData: { bentoWidth: 440 },
  }).id;
  editor.blocks.moveBlocks([tile], board, "inside");
  editor.history.clear();
  editor.blocks.updateBlock(tile, { pluginData: { bentoWidth: 600 } });
  editor.history.undo();
  expect(editor.blocks.getBlockNode(tile)?.pluginData.bentoWidth).toBe(440);
  const copy = editor.clipboard.copy(createStructuralSelection([board]));
  expect(copy?.blocks[0]?.children[0]?.pluginData.bentoWidth).toBe(440);
  const snapshot = editor.dump();
  editor.load(snapshot);
  expect(editor.dump()).toEqual(snapshot);
  editor.history.clear();
  editor.blocks.moveBlocks([tile], board, "after");
  expect(editor.blocks.getParentId(tile)).toBeNull();
  editor.history.undo();
  expect(editor.blocks.getParentId(tile)).toBe(board);
  const otherBoard = editor.blocks.insertBlock(createBentoBlockInput()).id;
  editor.blocks.moveBlocks([tile], otherBoard, "inside");
  expect(editor.blocks.getBlockNode(tile)?.pluginData.bentoWidth).toBe(440);
  editor.blocks.moveBlocks([tile], board, "inside");
  const nested = editor.blocks.insertBlock({ type: "paragraph", content: "Other" }).id;
  editor.blocks.moveBlocks([nested], board, "inside");
  indentBlocks(reactPanel, [nested]);
  expect(editor.blocks.getParentId(nested)).toBe(board);
  editor.blocks.indentBlock(nested);
  expect(editor.blocks.getParentId(nested)).toBe(board);
  reactPanel.editor.destroy();
  editor.destroy();
});

test("new and converted Bento blocks persist their default background", async () => {
  const editor = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), bentoExtension()],
  });
  const created = editor.blocks.insertBlock({ type: "bento" });
  expect(created.listProps.style).toEqual({ background: { color: "#eceef6" } });
  const original = editor.blocks.insertBlock({ type: "paragraph" });
  panel.slashCommands.execute("block.bento.insert", { blockId: original.id });
  expect(editor.blocks.getBlockNode(original.id)?.listProps.style).toEqual({
    background: { color: "#eceef6" },
  });
  panel.editor.destroy();
  editor.destroy();
});

test("restores an existing width when a child leaves Bento and undoes the transition", async () => {
  const editor = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), bentoExtension()],
  });
  try {
    const board = editor.blocks.insertBlock(createBentoBlockInput()).id;
    const child = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { style: { size: { width: "180px", height: "80px" } } },
      pluginData: { bentoWidth: 320 },
    }).id;
    editor.blocks.moveBlocks([child], board, "inside");
    expect(editor.blocks.getBlockNode(child)?.listProps.style).toEqual({
      size: { width: "320px", height: "80px" },
    });
    editor.history.clear();
    editor.blocks.moveBlocks([child], board, "after");
    expect(editor.blocks.getBlockNode(child)?.listProps.style).toEqual({
      size: { width: "180px", height: "80px" },
    });
    editor.history.undo();
    expect(editor.blocks.getBlockNode(child)?.listProps.style).toEqual({
      size: { width: "320px", height: "80px" },
    });
  } finally {
    panel.editor.destroy();
    editor.destroy();
  }
});

test("captures an absent width on creation and restores it after leaving Bento", async () => {
  const editor = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), bentoExtension()],
  });
  try {
    const board = editor.blocks.insertBlock({
      type: "bento",
      children: [
        {
          type: "paragraph",
          listProps: { style: { size: { height: "80px" } } },
          pluginData: { bentoWidth: 350 },
        },
      ],
    });
    const child = board.children[0]!;
    expect(editor.blocks.getBlockNode(child.id)?.listProps.style).toEqual({
      size: { width: "350px", height: "80px" },
    });
    expect(editor.blocks.getBlockNode(child.id)?.pluginData.bentoOriginalWidth).toEqual({
      present: false,
    });
    editor.history.clear();
    editor.blocks.moveBlocks([child.id], board.id, "after");
    expect(editor.blocks.getBlockNode(child.id)?.listProps.style).toEqual({
      size: { height: "80px" },
    });
    editor.history.undo();
    expect(editor.blocks.getBlockNode(child.id)?.listProps.style).toEqual({
      size: { width: "350px", height: "80px" },
    });
    editor.history.redo();
    expect(editor.blocks.getBlockNode(child.id)?.listProps.style).toEqual({
      size: { height: "80px" },
    });
  } finally {
    panel.editor.destroy();
    editor.destroy();
  }
});

test("pastes a Bento tile with the original width outside and reapplies its Bento width inside", async () => {
  const editor = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), bentoExtension()],
  });
  try {
    const board = editor.blocks.insertBlock({
      type: "bento",
      children: [
        {
          type: "paragraph",
          content: "copied tile",
          listProps: { style: { size: { width: "180px", height: "80px" } } },
          pluginData: { bentoWidth: 320 },
        },
      ],
    });
    const original = board.children[0]!;
    const bundle = editor.clipboard.copy(createStructuralSelection([original.id]))!;
    editor.clipboard.paste({
      bundle,
      placement: { parentId: null, afterId: null, mergeText: false },
    });
    const outsideId = editor.blocks.getRootIds().find((id) => id !== board.id)!;
    expect(editor.blocks.getBlockNode(outsideId)?.listProps.style).toEqual({
      size: { width: "180px", height: "80px" },
    });
    expect(editor.blocks.getBlockNode(outsideId)?.pluginData.bentoWidth).toBe(320);
    editor.clipboard.paste({
      bundle,
      placement: { parentId: board.id, afterId: null, mergeText: false },
    });
    const pastedId = editor.blocks.getChildIds(board.id).find((id) => id !== original.id)!;
    expect(editor.blocks.getBlockNode(pastedId)?.listProps.style).toEqual({
      size: { width: "320px", height: "80px" },
    });
    expect(editor.blocks.getBlockNode(pastedId)?.pluginData.bentoOriginalWidth).toEqual({
      present: true,
      value: "180px",
    });
    editor.blocks.moveBlocks([pastedId], board.id, "after");
    expect(editor.blocks.getBlockNode(pastedId)?.listProps.style).toEqual({
      size: { width: "180px", height: "80px" },
    });
  } finally {
    panel.editor.destroy();
    editor.destroy();
  }
});

test("restores pre-Bento height and retains the tile height across boards", async () => {
  const editor = await createTestCoreEditor({ registerWritingBlock: false });
  const panel = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), bentoExtension()],
  });
  try {
    const first = editor.blocks.insertBlock({ type: "bento" }).id;
    const second = editor.blocks.insertBlock({ type: "bento" }).id;
    const child = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { style: { size: { height: "80px", heightPolicy: "clip" } } },
    }).id;
    editor.blocks.moveBlocks([child], first, "inside");
    editor.blocks.updateBlock(child, {
      listProps: { style: { size: { width: "280px", height: "160px", heightPolicy: "scroll" } } },
      pluginData: { bentoHeight: { height: "160px", heightPolicy: "scroll" } },
    });
    editor.blocks.moveBlocks([child], second, "inside");
    expect(editor.blocks.getBlockNode(child)?.listProps.style).toMatchObject({
      size: { height: "160px", heightPolicy: "scroll" },
    });
    editor.blocks.moveBlocks([child], second, "after");
    expect(editor.blocks.getBlockNode(child)?.listProps.style).toMatchObject({
      size: { height: "80px", heightPolicy: "clip" },
    });
  } finally {
    panel.editor.destroy();
    editor.destroy();
  }
});

test("restores a height captured on a legacy Bento tile without a width marker", () => {
  const restored = restoreBentoSize({
    type: "paragraph",
    listProps: { style: { size: { width: "280px", height: "160px", heightPolicy: "scroll" } } },
    pluginData: { bentoOriginalHeight: { height: {}, policy: { value: "clip" } } },
  });
  expect(restored.listProps?.style).toEqual({ size: { width: "280px", heightPolicy: "clip" } });
  expect(restored.pluginData?.bentoOriginalHeight).toBeNull();
});

test("cross-document moves retain Bento size and restore the original width on exit", async () => {
  const { transferBlocksBetweenDocuments } = await import("../../../block-transfer/cross-document-block-transfer");
  const source = await createTestCoreEditor({ registerWritingBlock: false });
  const destination = await createTestCoreEditor({ registerWritingBlock: false });
  const sourcePanel = createReactEditor({
    editor: source,
    extensions: [defaultWritingBlockExtension(), bentoExtension()],
  });
  const destinationPanel = createReactEditor({
    editor: destination,
    extensions: [defaultWritingBlockExtension(), bentoExtension()],
  });
  try {
    const from = source.blocks.insertBlock(createBentoBlockInput()).id;
    const to = destination.blocks.insertBlock(createBentoBlockInput()).id;
    const tile = source.blocks.insertBlock({
      type: "paragraph",
      listProps: { style: { size: { width: "123px" } } },
      pluginData: { bentoWidth: 440 },
    }).id;
    source.blocks.moveBlocks([tile], from, "inside");
    transferBlocksBetweenDocuments(source, destination, [tile], {
      targetId: to,
      position: "inside",
    });
    expect(destination.blocks.getBlockNode(tile)?.listProps.style).toMatchObject({
      size: { width: "440px" },
    });
    transferBlocksBetweenDocuments(destination, source, [tile], {
      targetId: null,
      position: "after",
    });
    expect(source.blocks.getBlockNode(tile)?.listProps.style).toMatchObject({
      size: { width: "123px" },
    });
  } finally {
    sourcePanel.editor.destroy();
    destinationPanel.editor.destroy();
    await source.destroy();
    await destination.destroy();
  }
});
