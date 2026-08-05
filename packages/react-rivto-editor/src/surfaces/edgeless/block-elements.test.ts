import { createRivtoEditor } from "@chulane/rivto";
import { createReactEditor } from "../../react-editor";
import {
  blockIdsOf,
  EDGELESS_BLOCK_ELEMENT_ID_PREFIX,
  reconcileBlockElements,
} from "./block-elements";

describe("edgeless block element reconciliation", () => {
  const ranges = (editor: ReturnType<typeof createRivtoEditor>) => {
    const rootIds = editor.blocks.getRootIds();
    return editor.elements.getElements().map((element) => blockIdsOf(element, rootIds));
  };

  test("automatically reconciles block edits without adding derived history steps", async () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, first);
    await Promise.resolve();
    expect(ranges(editor)).toEqual([[first, last]]);

    editor.history.clear();
    const separator = editor.blocks.insertBlock({ type: "paragraph", content: "" }, first);
    await Promise.resolve();
    expect(ranges(editor)).toEqual([[first, separator, last]]);

    editor.undo();
    await Promise.resolve();
    expect(editor.blocks.getBlock(separator)).toBeUndefined();
    expect(ranges(editor)).toEqual([[first, last]]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("partitions root runs around unowned empty paragraphs", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    editor.blocks.insertBlock({ type: "paragraph", content: "" }, first);
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, editor.blocks.getRootIds().at(-1));
    const reactEditor = createReactEditor({ editor });

    reconcileBlockElements(reactEditor);

    const elements = editor.elements.getElements();
    expect(ranges(editor)).toEqual([[first], [last]]);
    expect(elements.map((element) => element.id)).toEqual([
      `${EDGELESS_BLOCK_ELEMENT_ID_PREFIX}${first}`,
      `${EDGELESS_BLOCK_ELEMENT_ID_PREFIX}${last}`,
    ]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("keeps explicitly owned empty roots and ignores nested separators", () => {
    const editor = createRivtoEditor();
    const root = editor.blocks.insertBlock({ type: "paragraph", content: "" });
    const child = editor.blocks.insertBlock({ type: "paragraph", content: "" }, root);
    editor.blocks.indentBlock(child);
    editor.elements.insertElement({ id: "card", type: "block", frame: { x: 1, y: 2, width: 300, height: 120 }, zIndex: 0, props: { startBlockId: root, endBlockId: root } });
    const reactEditor = createReactEditor({ editor });

    reconcileBlockElements(reactEditor);

    expect(editor.elements.getElements()).toHaveLength(1);
    expect(blockIdsOf(editor.elements.getElement("card")!, editor.blocks.getRootIds())).toEqual([root]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("keeps several empty roots inside persisted range boundaries", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, first);
    editor.elements.insertElement({ id: "card", type: "block", frame: { x: 10, y: 20, width: 300, height: 120 }, zIndex: 0, props: { startBlockId: first, endBlockId: last } });
    const reactEditor = createReactEditor({ editor });
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

  test("supports a custom root separator predicate", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    editor.blocks.insertBlock({ type: "paragraph", content: "---" }, first);
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, editor.blocks.getRootIds().at(-1));
    const reactEditor = createReactEditor({ editor, edgeless: { isBlockElementSeparator: (block) => block.content === "---" } });
    reconcileBlockElements(reactEditor);
    expect(ranges(editor)).toEqual([[first], [last]]);
    reactEditor.destroy();
    editor.destroy();
  });
});
