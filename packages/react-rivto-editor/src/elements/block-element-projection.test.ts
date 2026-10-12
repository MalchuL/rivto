import { createTestReactEditor as createReactEditor, createTestCoreEditor as createDocumentEditor } from "../test-utils";

import { SEPARATOR_BLOCK_TYPE, separatorBlockExtension } from "../extensions/built-ins/separator/separator-block";
import {
  blockFramesOverlap,
  blockIdsOf,
  EDGELESS_BLOCK_ELEMENT_ID_PREFIX,
  EDGELESS_CARD_DEFAULT_FRAME,
  elementContainsBlock,
  nonOverlappingBlockFrame,
} from "./block-element-projection";

describe("edgeless block element reconciliation", () => {
  const createRuntime = (editor: Awaited<ReturnType<typeof createDocumentEditor>>) => createReactEditor({
    editor,
    extensions: [separatorBlockExtension()],
  });
  const ranges = (editor: Awaited<ReturnType<typeof createDocumentEditor>>) => {
    const rootIds = editor.blocks.getRootIds();
    return editor.elements.getElementNodes().map((element) => blockIdsOf(element, rootIds));
  };

  test("finds deterministic free block frames while allowing touching edges", () => {
    const preferred = { x: 0, y: 0, width: 40, height: 40 };
    expect(blockFramesOverlap(preferred, { x: 40, y: 0, width: 40, height: 40 })).toBe(false);
    expect(blockFramesOverlap(preferred, { x: 39, y: 0, width: 40, height: 40 })).toBe(true);
    expect(nonOverlappingBlockFrame(preferred, [preferred], 20))
      .toEqual({ x: 40, y: 0, width: 40, height: 40 });
  });

  test("avoids only block cards when reconciling new ranges and supports opt-out", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const separator = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE }, editor.blocks.getInsertionDestinationAfter(first)).id;
    editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, editor.blocks.getInsertionDestinationAfter(separator));
    editor.elements.insertElement({ type: "rectangle", frame: { x: 60, y: 60, width: 1000, height: 1000 }, zIndex: 0 });
    panel.editor.blockElements.reconcile();
    const cards = editor.elements.getElementNodes().filter((element) => element.type === "block");
    expect(cards).toHaveLength(2);
    expect(blockFramesOverlap(cards[0]!.frame, cards[1]!.frame)).toBe(false);
    expect(cards[0]!.frame).toMatchObject({ x: 60, y: 60 });
    panel.editor.destroy();
    editor.destroy();

    const overlapEditor = await createDocumentEditor();
    const overlapRuntime = createRuntime(overlapEditor);
    const left = overlapEditor.blocks.insertBlock({ type: "paragraph" }).id;
    const split = overlapEditor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE }, overlapEditor.blocks.getInsertionDestinationAfter(left)).id;
    overlapEditor.blocks.insertBlock({ type: "paragraph" }, overlapEditor.blocks.getInsertionDestinationAfter(split));
    overlapRuntime.editor.blockElements.setOverlapAvoidance(false);
    overlapRuntime.editor.blockElements.reconcile();
    const overlapping = overlapEditor.elements.getElementNodes();
    expect(blockFramesOverlap(overlapping[0]!.frame, overlapping[1]!.frame)).toBe(true);
    overlapRuntime.editor.destroy();
    overlapEditor.destroy();
  });

  test("uses the page-sized default card width and accepts a panel override", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    editor.blocks.insertBlock({ type: "paragraph" });
    panel.editor.blockElements.setDefaultWidth(640);

    panel.editor.blockElements.reconcile();

    expect(EDGELESS_CARD_DEFAULT_FRAME.width).toBe(720);
    expect(editor.elements.getElementNodes()[0]!.frame.width).toBe(640);
    panel.editor.destroy();
    editor.destroy();
  });

  test("automatically reconciles block edits without adding derived history steps", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, editor.blocks.getInsertionDestinationAfter(first)).id;
    await Promise.resolve();
    expect(ranges(editor)).toEqual([[first, last]]);

    editor.history.clear();
    const separator = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE, content: "" }, editor.blocks.getInsertionDestinationAfter(first)).id;
    await Promise.resolve();
    expect(ranges(editor)).toEqual([[first], [last]]);

    editor.history.undo();
    await Promise.resolve();
    expect(editor.blocks.hasBlock(separator)).toBe(false);
    expect(ranges(editor)).toEqual([[first, last]]);
    panel.editor.destroy();
    editor.destroy();
  });

  test("keeps consecutive empty paragraphs as ordinary card content", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const empty = editor.blocks.insertBlock({ type: "paragraph", content: "" }, editor.blocks.getInsertionDestinationAfter(first)).id;
    const secondEmpty = editor.blocks.insertBlock({ type: "paragraph", content: "" }, editor.blocks.getInsertionDestinationAfter(empty)).id;
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, editor.blocks.getInsertionDestinationAfter(secondEmpty)).id;

    panel.editor.blockElements.reconcile();

    const elements = editor.elements.getElementNodes();
    expect(ranges(editor)).toEqual([[first, empty, secondEmpty, last]]);
    expect(elements.map((element) => element.id)).toEqual([`${EDGELESS_BLOCK_ELEMENT_ID_PREFIX}${first}`]);
    panel.editor.destroy();
    editor.destroy();
  });

  test("ignores nested separators when partitioning document roots", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    const root = editor.blocks.insertBlock({ type: "paragraph", content: "" }).id;
    const child = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE, content: "" }, editor.blocks.getInsertionDestinationAfter(root)).id;
    editor.blocks.indentBlock(child);
    editor.elements.insertElement({ id: "card", type: "block", frame: { x: 1, y: 2, width: 300, height: 120 }, zIndex: 0, props: { startBlockId: root, endBlockId: root } });

    panel.editor.blockElements.reconcile();

    expect(editor.elements.getElementNodes()).toHaveLength(1);
    expect(blockIdsOf(editor.elements.getElementNode("card")!, editor.blocks.getRootIds())).toEqual([root]);
    panel.editor.destroy();
    editor.destroy();
  });

  test("elementContainsBlock accepts nested descendants of card roots", async () => {
    const editor = await createDocumentEditor();
    const root = editor.blocks.insertBlock({ type: "paragraph", content: "Root" }).id;
    const child = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, editor.blocks.getInsertionDestinationAfter(root)).id;
    editor.blocks.indentBlock(child);
    const outsider = editor.blocks.insertBlock({ type: "paragraph", content: "Other" }, editor.blocks.getInsertionDestinationAfter(root)).id;
    const card = { childIds: [], id: "card",
      type: "block" as const,
      frame: { x: 0, y: 0, width: 300, height: 120 },
      zIndex: 0,
      props: { startBlockId: root, endBlockId: root },
    };
    editor.elements.insertElement(card);
    const roots = editor.blocks.getRootIds();
    expect(elementContainsBlock(editor.blocks, card, roots, root)).toBe(true);
    expect(elementContainsBlock(editor.blocks, card, roots, child)).toBe(true);
    expect(elementContainsBlock(editor.blocks, card, roots, outsider)).toBe(false);
    // Roots-only membership (legacy) would reject the indented child.
    expect(blockIdsOf(card, roots).includes(child)).toBe(false);
    editor.destroy();
  });

  test("keeps several empty roots inside persisted range boundaries", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, editor.blocks.getInsertionDestinationAfter(first)).id;
    editor.elements.insertElement({ id: "card", type: "block", frame: { x: 10, y: 20, width: 300, height: 120 }, zIndex: 0, props: { startBlockId: first, endBlockId: last } });
    const firstEmpty = editor.blocks.insertBlock({ type: "paragraph", content: "" }, editor.blocks.getInsertionDestinationAfter(first)).id;
    const secondEmpty = editor.blocks.insertBlock({ type: "paragraph", content: "" }, editor.blocks.getInsertionDestinationAfter(firstEmpty)).id;

    panel.editor.blockElements.reconcile();

    expect(editor.elements.getElementNodes()).toHaveLength(1);
    expect(ranges(editor)).toEqual([[first, firstEmpty, secondEmpty, last]]);
    expect(editor.elements.getElementNode("card")?.props).toEqual({ startBlockId: first, endBlockId: last });
    expect(editor.elements.getElementNode("card")?.frame).toMatchObject({ x: 10, y: 20 });
    panel.editor.destroy();
    editor.destroy();
  });

  test("keeps the first card on split and the earlier card on merge", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const middle = editor.blocks.insertBlock({ type: "paragraph", content: "Middle" }, editor.blocks.getInsertionDestinationAfter(first)).id;
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, editor.blocks.getInsertionDestinationAfter(middle)).id;
    editor.elements.insertElement({ id: "original-card", type: "block", frame: { x: 410, y: 220, width: 360, height: 180 }, zIndex: 4, props: { startBlockId: first, endBlockId: last } });
    panel.editor.blockElements.reconcile();
    await Promise.resolve();

    const separator = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE }, editor.blocks.getInsertionDestinationAfter(first)).id;
    await Promise.resolve();

    expect(blockIdsOf(editor.elements.getElementNode("original-card")!, editor.blocks.getRootIds())).toEqual([first]);
    expect(editor.elements.getElementNode("original-card")?.frame).toMatchObject({ x: 410, y: 220 });
    expect(editor.elements.getElementNodes()).toHaveLength(2);

    editor.blocks.removeBlock(separator);
    await Promise.resolve();

    expect(editor.elements.getElementNodes()).toHaveLength(1);
    expect(blockIdsOf(editor.elements.getElementNode("original-card")!, editor.blocks.getRootIds())).toEqual([first, middle, last]);
    expect(editor.elements.getElementNode("original-card")?.frame).toMatchObject({ x: 410, y: 220 });
    panel.editor.destroy();
    editor.destroy();
  });

  test("keeps element identity and geometry when the first range block moves across a separator", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const middle = editor.blocks.insertBlock({ type: "paragraph", content: "Middle" }, editor.blocks.getInsertionDestinationAfter(first)).id;
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, editor.blocks.getInsertionDestinationAfter(middle)).id;
    const separator = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE, content: "" }, editor.blocks.getInsertionDestinationAfter(last)).id;
    const rightFirst = editor.blocks.insertBlock({ type: "paragraph", content: "Right first" }, editor.blocks.getInsertionDestinationAfter(separator)).id;
    const rightLast = editor.blocks.insertBlock({ type: "paragraph", content: "Right last" }, editor.blocks.getInsertionDestinationAfter(rightFirst)).id;
    editor.elements.insertElement({ id: "left-card", type: "block", frame: { x: 10, y: 20, width: 300, height: 120 }, zIndex: 1, props: { startBlockId: first, endBlockId: last } });
    editor.elements.insertElement({ id: "right-card", type: "block", frame: { x: 500, y: 200, width: 400, height: 180 }, zIndex: 2, props: { startBlockId: rightFirst, endBlockId: rightLast } });
    panel.editor.blockElements.reconcile();

    editor.blocks.moveBlock(first, rightFirst, "after");
    await Promise.resolve();

    expect(editor.elements.getElementNodes()).toHaveLength(2);
    expect(blockIdsOf(editor.elements.getElementNode("left-card")!, editor.blocks.getRootIds())).toEqual([middle, last]);
    expect(blockIdsOf(editor.elements.getElementNode("right-card")!, editor.blocks.getRootIds())).toEqual([rightFirst, first, rightLast]);
    expect(editor.elements.getElementNode("left-card")?.frame).toMatchObject({ x: 10, y: 20 });
    expect(editor.elements.getElementNode("right-card")?.frame).toMatchObject({ x: 500, y: 200 });
    panel.editor.destroy();
    editor.destroy();
  });

  test("keeps element identity and geometry when the last range block moves across a separator", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const middle = editor.blocks.insertBlock({ type: "paragraph", content: "Middle" }, editor.blocks.getInsertionDestinationAfter(first)).id;
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, editor.blocks.getInsertionDestinationAfter(middle)).id;
    const separator = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE, content: "" }, editor.blocks.getInsertionDestinationAfter(last)).id;
    const rightFirst = editor.blocks.insertBlock({ type: "paragraph", content: "Right first" }, editor.blocks.getInsertionDestinationAfter(separator)).id;
    const rightLast = editor.blocks.insertBlock({ type: "paragraph", content: "Right last" }, editor.blocks.getInsertionDestinationAfter(rightFirst)).id;
    editor.elements.insertElement({ id: "left-card", type: "block", frame: { x: 10, y: 20, width: 300, height: 120 }, zIndex: 1, props: { startBlockId: first, endBlockId: last } });
    editor.elements.insertElement({ id: "right-card", type: "block", frame: { x: 500, y: 200, width: 400, height: 180 }, zIndex: 2, props: { startBlockId: rightFirst, endBlockId: rightLast } });
    panel.editor.blockElements.reconcile();

    editor.blocks.moveBlock(last, rightFirst, "after");
    await Promise.resolve();

    expect(editor.elements.getElementNodes()).toHaveLength(2);
    expect(blockIdsOf(editor.elements.getElementNode("left-card")!, editor.blocks.getRootIds())).toEqual([first, middle]);
    expect(blockIdsOf(editor.elements.getElementNode("right-card")!, editor.blocks.getRootIds())).toEqual([rightFirst, last, rightLast]);
    expect(editor.elements.getElementNode("left-card")?.frame).toMatchObject({ x: 10, y: 20 });
    expect(editor.elements.getElementNode("right-card")?.frame).toMatchObject({ x: 500, y: 200 });
    panel.editor.destroy();
    editor.destroy();
  });

  test("matches all reusable elements globally instead of taking the first local overlap", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    const leftIds = ["a", "b", "c", "d", "e"].map((id, index, ids) =>
      editor.blocks.insertBlock({ id, type: "paragraph", content: id }, editor.blocks.getInsertionDestinationAfter(index ? ids[index - 1] : undefined)).id);
    const separator = editor.blocks.insertBlock({ id: "separator", type: SEPARATOR_BLOCK_TYPE, content: "" }, editor.blocks.getInsertionDestinationAfter(leftIds.at(-1))).id;
    const rightFirst = editor.blocks.insertBlock({ id: "f", type: "paragraph", content: "f" }, editor.blocks.getInsertionDestinationAfter(separator)).id;
    const rightLast = editor.blocks.insertBlock({ id: "g", type: "paragraph", content: "g" }, editor.blocks.getInsertionDestinationAfter(rightFirst)).id;
    editor.elements.insertElement({ id: "left-card", type: "block", frame: { x: 10, y: 20, width: 300, height: 120 }, zIndex: 1, props: { startBlockId: leftIds[0]!, endBlockId: leftIds.at(-1)! } });
    editor.elements.insertElement({ id: "right-card", type: "block", frame: { x: 500, y: 200, width: 400, height: 180 }, zIndex: 2, props: { startBlockId: rightFirst, endBlockId: rightLast } });
    panel.editor.blockElements.reconcile();

    editor.history.batchUpdates(() => {
      editor.blocks.moveBlocks([rightFirst, rightLast], leftIds[2]!, "after");
      editor.blocks.moveBlock(separator, rightLast, "after");
    });
    await Promise.resolve();

    expect(editor.elements.getElementNodes().map((element) => element.id).sort()).toEqual(["left-card", "right-card"]);
    expect(blockIdsOf(editor.elements.getElementNode("right-card")!, editor.blocks.getRootIds())).toEqual(["a", "b", "c", "f", "g"]);
    expect(blockIdsOf(editor.elements.getElementNode("left-card")!, editor.blocks.getRootIds())).toEqual(["d", "e"]);
    expect(editor.elements.getElementNode("left-card")?.frame).toMatchObject({ x: 10, y: 20 });
    expect(editor.elements.getElementNode("right-card")?.frame).toMatchObject({ x: 500, y: 200 });
    panel.editor.destroy();
    editor.destroy();
  });

  test("repairs a missing range end without replacing the card owning its start", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const last = editor.blocks.insertBlock({ type: "paragraph" }, editor.blocks.getInsertionDestinationAfter(first)).id;
    editor.elements.insertElement({ id: "card", type: "block", frame: { x: 300, y: 200, width: 400, height: 150 }, zIndex: 4,
      props: { startBlockId: first, endBlockId: "missing" },
    });
    panel.editor.blockElements.reconcile();
    expect(editor.elements.getElementNodes()).toEqual([expect.objectContaining({
      id: "card", frame: { x: 300, y: 200, width: 400, height: 150 }, zIndex: 4,
      props: { startBlockId: first, endBlockId: last },
    })]);
    panel.editor.destroy();
    editor.destroy();
  });

  test("reconciles root cards without reading descendant snapshots", async () => {
    const editor = await createDocumentEditor();
    const panel = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const child = editor.blocks.insertBlock({ type: "paragraph" }, editor.blocks.getInsertionDestinationAfter(first)).id;
    editor.blocks.indentBlock(child);
    await Promise.resolve();
    const getBlocks = editor.blocks.getBlocks;
    editor.blocks.getBlocks = () => { throw new Error("Unexpected full-tree read"); };
    try {
      panel.editor.blockElements.reconcile();
      expect(ranges(editor)).toEqual([[first]]);
      expect(editor.blocks.getParentId(child)).toBe(first);
    } finally {
      editor.blocks.getBlocks = getBlocks;
      panel.editor.destroy();
      editor.destroy();
    }
  });

  test("supports a custom separator block plugin", async () => {
    const editor = await createDocumentEditor();
    const panel = createReactEditor({
      editor,
      extensions: [{
        id: "custom-separator",
        setup: (reactEditor) => {
          reactEditor.blockTypes.register({
            definition: { type: "test.separator" },
            render: () => null,
            separatesBlockElements: true,
          });
        },
      }],
    });
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    editor.blocks.insertBlock({ type: "test.separator" }, editor.blocks.getInsertionDestinationAfter(first));
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, editor.blocks.getInsertionDestinationAfter(editor.blocks.getRootIds().at(-1))).id;
    panel.editor.blockElements.reconcile();
    expect(ranges(editor)).toEqual([[first], [last]]);
    panel.editor.destroy();
    editor.destroy();
  });
});

test("queued projection work cannot mutate the document after runtime destruction", async () => {
  const core = await createDocumentEditor();
  const panel = createReactEditor({ editor: core });
  core.blocks.insertBlock({ type: "paragraph", content: "Pending card" });
  panel.editor.blockElements.schedule();
  panel.editor.destroy();
  await Promise.resolve();
  expect(core.elements.getElementNodes()).toHaveLength(0);
  core.destroy();
});
