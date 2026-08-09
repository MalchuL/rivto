import { createRivtoEditor } from "@chulane/rivto";
import { createReactEditor } from "../../react-editor";
import { SEPARATOR_BLOCK_TYPE, separatorBlockExtension } from "../../extensions/separator/separator-block";
import {
  blockIdsOf,
  EDGELESS_BLOCK_ELEMENT_ID_PREFIX,
  elementContainsBlock,
  reconcileBlockElements,
} from "./block-elements";

describe("edgeless block element reconciliation", () => {
  const createRuntime = (editor: ReturnType<typeof createRivtoEditor>) => createReactEditor({
    editor,
    extensions: [separatorBlockExtension()],
  });
  const ranges = (editor: ReturnType<typeof createRivtoEditor>) => {
    const rootIds = editor.blocks.getRootIds();
    return editor.elements.getElements().map((element) => blockIdsOf(element, rootIds));
  };

  test("automatically reconciles block edits without adding derived history steps", async () => {
    const editor = createRivtoEditor();
    const reactEditor = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, first);
    await Promise.resolve();
    expect(ranges(editor)).toEqual([[first, last]]);

    editor.history.clear();
    const separator = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE, content: "" }, first);
    await Promise.resolve();
    expect(ranges(editor)).toEqual([[first], [last]]);

    editor.undo();
    await Promise.resolve();
    expect(editor.blocks.getBlock(separator)).toBeUndefined();
    expect(ranges(editor)).toEqual([[first, last]]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("keeps consecutive empty paragraphs as ordinary card content", () => {
    const editor = createRivtoEditor();
    const reactEditor = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const empty = editor.blocks.insertBlock({ type: "paragraph", content: "" }, first);
    const secondEmpty = editor.blocks.insertBlock({ type: "paragraph", content: "" }, empty);
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, secondEmpty);

    reconcileBlockElements(reactEditor);

    const elements = editor.elements.getElements();
    expect(ranges(editor)).toEqual([[first, empty, secondEmpty, last]]);
    expect(elements.map((element) => element.id)).toEqual([`${EDGELESS_BLOCK_ELEMENT_ID_PREFIX}${first}`]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("ignores nested separators when partitioning document roots", () => {
    const editor = createRivtoEditor();
    const reactEditor = createRuntime(editor);
    const root = editor.blocks.insertBlock({ type: "paragraph", content: "" });
    const child = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE, content: "" }, root);
    editor.blocks.indentBlock(child);
    editor.elements.insertElement({ id: "card", type: "block", frame: { x: 1, y: 2, width: 300, height: 120 }, zIndex: 0, props: { startBlockId: root, endBlockId: root } });

    reconcileBlockElements(reactEditor);

    expect(editor.elements.getElements()).toHaveLength(1);
    expect(blockIdsOf(editor.elements.getElement("card")!, editor.blocks.getRootIds())).toEqual([root]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("elementContainsBlock accepts nested descendants of card roots", () => {
    const editor = createRivtoEditor();
    const root = editor.blocks.insertBlock({ type: "paragraph", content: "Root" });
    const child = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }, root);
    editor.blocks.indentBlock(child);
    const outsider = editor.blocks.insertBlock({ type: "paragraph", content: "Other" }, root);
    const card = {
      id: "card",
      type: "block" as const,
      frame: { x: 0, y: 0, width: 300, height: 120 },
      zIndex: 0,
      props: { startBlockId: root, endBlockId: root },
    };
    editor.elements.insertElement(card);
    const roots = editor.blocks.getRootIds();
    expect(elementContainsBlock(editor, card, roots, root)).toBe(true);
    expect(elementContainsBlock(editor, card, roots, child)).toBe(true);
    expect(elementContainsBlock(editor, card, roots, outsider)).toBe(false);
    // Roots-only membership (legacy) would reject the indented child.
    expect(blockIdsOf(card, roots).includes(child)).toBe(false);
    editor.destroy();
  });

  test("keeps several empty roots inside persisted range boundaries", () => {
    const editor = createRivtoEditor();
    const reactEditor = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, first);
    editor.elements.insertElement({ id: "card", type: "block", frame: { x: 10, y: 20, width: 300, height: 120 }, zIndex: 0, props: { startBlockId: first, endBlockId: last } });
    const firstEmpty = editor.blocks.insertBlock({ type: "paragraph", content: "" }, first);
    const secondEmpty = editor.blocks.insertBlock({ type: "paragraph", content: "" }, firstEmpty);

    reconcileBlockElements(reactEditor);

    expect(editor.elements.getElements()).toHaveLength(1);
    expect(ranges(editor)).toEqual([[first, firstEmpty, secondEmpty, last]]);
    expect(editor.elements.getElement("card")?.props).toEqual({ startBlockId: first, endBlockId: last });
    expect(editor.elements.getElement("card")?.frame).toMatchObject({ x: 10, y: 20 });
    reactEditor.destroy();
    editor.destroy();
  });

  test("keeps the first card on split and the earlier card on merge", async () => {
    const editor = createRivtoEditor();
    const reactEditor = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const middle = editor.blocks.insertBlock({ type: "paragraph", content: "Middle" }, first);
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, middle);
    editor.elements.insertElement({ id: "original-card", type: "block", frame: { x: 410, y: 220, width: 360, height: 180 }, zIndex: 4, props: { startBlockId: first, endBlockId: last } });
    reconcileBlockElements(reactEditor);
    await Promise.resolve();

    const separator = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE }, first);
    await Promise.resolve();

    expect(blockIdsOf(editor.elements.getElement("original-card")!, editor.blocks.getRootIds())).toEqual([first]);
    expect(editor.elements.getElement("original-card")?.frame).toMatchObject({ x: 410, y: 220 });
    expect(editor.elements.getElements()).toHaveLength(2);

    editor.blocks.removeBlock(separator);
    await Promise.resolve();

    expect(editor.elements.getElements()).toHaveLength(1);
    expect(blockIdsOf(editor.elements.getElement("original-card")!, editor.blocks.getRootIds())).toEqual([first, middle, last]);
    expect(editor.elements.getElement("original-card")?.frame).toMatchObject({ x: 410, y: 220 });
    reactEditor.destroy();
    editor.destroy();
  });

  test("keeps element identity and geometry when the first range block moves across a separator", async () => {
    const editor = createRivtoEditor();
    const reactEditor = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const middle = editor.blocks.insertBlock({ type: "paragraph", content: "Middle" }, first);
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, middle);
    const separator = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE, content: "" }, last);
    const rightFirst = editor.blocks.insertBlock({ type: "paragraph", content: "Right first" }, separator);
    const rightLast = editor.blocks.insertBlock({ type: "paragraph", content: "Right last" }, rightFirst);
    editor.elements.insertElement({ id: "left-card", type: "block", frame: { x: 10, y: 20, width: 300, height: 120 }, zIndex: 1, props: { startBlockId: first, endBlockId: last } });
    editor.elements.insertElement({ id: "right-card", type: "block", frame: { x: 500, y: 200, width: 400, height: 180 }, zIndex: 2, props: { startBlockId: rightFirst, endBlockId: rightLast } });
    reconcileBlockElements(reactEditor);

    editor.blocks.moveBlock(first, rightFirst, "after");
    await Promise.resolve();

    expect(editor.elements.getElements()).toHaveLength(2);
    expect(blockIdsOf(editor.elements.getElement("left-card")!, editor.blocks.getRootIds())).toEqual([middle, last]);
    expect(blockIdsOf(editor.elements.getElement("right-card")!, editor.blocks.getRootIds())).toEqual([rightFirst, first, rightLast]);
    expect(editor.elements.getElement("left-card")?.frame).toMatchObject({ x: 10, y: 20 });
    expect(editor.elements.getElement("right-card")?.frame).toMatchObject({ x: 500, y: 200 });
    reactEditor.destroy();
    editor.destroy();
  });

  test("keeps element identity and geometry when the last range block moves across a separator", async () => {
    const editor = createRivtoEditor();
    const reactEditor = createRuntime(editor);
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const middle = editor.blocks.insertBlock({ type: "paragraph", content: "Middle" }, first);
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, middle);
    const separator = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE, content: "" }, last);
    const rightFirst = editor.blocks.insertBlock({ type: "paragraph", content: "Right first" }, separator);
    const rightLast = editor.blocks.insertBlock({ type: "paragraph", content: "Right last" }, rightFirst);
    editor.elements.insertElement({ id: "left-card", type: "block", frame: { x: 10, y: 20, width: 300, height: 120 }, zIndex: 1, props: { startBlockId: first, endBlockId: last } });
    editor.elements.insertElement({ id: "right-card", type: "block", frame: { x: 500, y: 200, width: 400, height: 180 }, zIndex: 2, props: { startBlockId: rightFirst, endBlockId: rightLast } });
    reconcileBlockElements(reactEditor);

    editor.blocks.moveBlock(last, rightFirst, "after");
    await Promise.resolve();

    expect(editor.elements.getElements()).toHaveLength(2);
    expect(blockIdsOf(editor.elements.getElement("left-card")!, editor.blocks.getRootIds())).toEqual([first, middle]);
    expect(blockIdsOf(editor.elements.getElement("right-card")!, editor.blocks.getRootIds())).toEqual([rightFirst, last, rightLast]);
    expect(editor.elements.getElement("left-card")?.frame).toMatchObject({ x: 10, y: 20 });
    expect(editor.elements.getElement("right-card")?.frame).toMatchObject({ x: 500, y: 200 });
    reactEditor.destroy();
    editor.destroy();
  });

  test("matches all reusable elements globally instead of taking the first local overlap", async () => {
    const editor = createRivtoEditor();
    const reactEditor = createRuntime(editor);
    const leftIds = ["a", "b", "c", "d", "e"].map((id, index, ids) =>
      editor.blocks.insertBlock({ id, type: "paragraph", content: id }, index ? ids[index - 1] : undefined));
    const separator = editor.blocks.insertBlock({ id: "separator", type: SEPARATOR_BLOCK_TYPE, content: "" }, leftIds.at(-1));
    const rightFirst = editor.blocks.insertBlock({ id: "f", type: "paragraph", content: "f" }, separator);
    const rightLast = editor.blocks.insertBlock({ id: "g", type: "paragraph", content: "g" }, rightFirst);
    editor.elements.insertElement({ id: "left-card", type: "block", frame: { x: 10, y: 20, width: 300, height: 120 }, zIndex: 1, props: { startBlockId: leftIds[0]!, endBlockId: leftIds.at(-1)! } });
    editor.elements.insertElement({ id: "right-card", type: "block", frame: { x: 500, y: 200, width: 400, height: 180 }, zIndex: 2, props: { startBlockId: rightFirst, endBlockId: rightLast } });
    reconcileBlockElements(reactEditor);

    editor.batchUpdates(() => {
      editor.blocks.moveBlocks([rightFirst, rightLast], leftIds[2]!, "after");
      editor.blocks.moveBlock(separator, rightLast, "after");
    });
    await Promise.resolve();

    expect(editor.elements.getElements().map((element) => element.id).sort()).toEqual(["left-card", "right-card"]);
    expect(blockIdsOf(editor.elements.getElement("right-card")!, editor.blocks.getRootIds())).toEqual(["a", "b", "c", "f", "g"]);
    expect(blockIdsOf(editor.elements.getElement("left-card")!, editor.blocks.getRootIds())).toEqual(["d", "e"]);
    expect(editor.elements.getElement("left-card")?.frame).toMatchObject({ x: 10, y: 20 });
    expect(editor.elements.getElement("right-card")?.frame).toMatchObject({ x: 500, y: 200 });
    reactEditor.destroy();
    editor.destroy();
  });

  test("supports a custom separator block plugin", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [{
        id: "custom-separator",
        setup: (runtime) => {
          runtime.blocks.register({
            definition: { type: "test.separator" },
            render: () => null,
            separatesBlockElements: true,
          });
        },
      }],
    });
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    editor.blocks.insertBlock({ type: "test.separator" }, first);
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, editor.blocks.getRootIds().at(-1));
    reconcileBlockElements(reactEditor);
    expect(ranges(editor)).toEqual([[first], [last]]);
    reactEditor.destroy();
    editor.destroy();
  });
});
