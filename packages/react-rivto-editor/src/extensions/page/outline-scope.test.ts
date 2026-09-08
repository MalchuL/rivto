import { createTestCoreEditor as createRivtoEditor } from "../../test-utils";
import { createReactEditor } from "../../react-editor";
import { SEPARATOR_BLOCK_TYPE, separatorBlockExtension } from "../separator/separator-block";
import {
  adjacentBlockSelection,
  keyboardMovePlacement,
  pageEntries,
} from "./page-selection-utils";
import {
  navigationOutlineBlocks,
  owningBlockElement,
} from "./outline-scope";

describe("edgeless outline scope", () => {
  const twoCards = () => {
    const editor = createRivtoEditor({ mode: "edgeless" });
    const reactEditor = createReactEditor({
      editor,
      extensions: [separatorBlockExtension()],
    });
    const leftA = editor.blocks.insertBlock({ type: "paragraph", content: "Left A" });
    const leftB = editor.blocks.insertBlock({ type: "paragraph", content: "Left B" }, leftA);
    const separator = editor.blocks.insertBlock({ type: SEPARATOR_BLOCK_TYPE, content: "" }, leftB);
    const rightA = editor.blocks.insertBlock({ type: "paragraph", content: "Right A" }, separator);
    const rightB = editor.blocks.insertBlock({ type: "paragraph", content: "Right B" }, rightA);
    editor.elements.insertElement({
      id: "left",
      type: "block",
      frame: { x: 0, y: 0, width: 200, height: 120 },
      zIndex: 0,
      props: { startBlockId: leftA, endBlockId: leftB },
    });
    editor.elements.insertElement({
      id: "right",
      type: "block",
      frame: { x: 300, y: 0, width: 200, height: 120 },
      zIndex: 1,
      props: { startBlockId: rightA, endBlockId: rightB },
    });
    return { editor, reactEditor, leftA, leftB, rightA, rightB };
  };

  test("navigationOutlineBlocks keeps page mode as the full document", () => {
    const editor = createRivtoEditor({ mode: "block" });
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "A" });
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "B" }, first);
    expect(navigationOutlineBlocks(editor, first).map((block) => block.id)).toEqual([first, second]);
    editor.destroy();
  });

  test("navigationOutlineBlocks stays inside the owning card", () => {
    const { editor, reactEditor, leftA, leftB, rightA, rightB } = twoCards();
    expect(owningBlockElement(editor, leftB)?.id).toBe("left");
    expect(navigationOutlineBlocks(editor, leftB).map((block) => block.id)).toEqual([leftA, leftB]);
    expect(navigationOutlineBlocks(editor, rightA).map((block) => block.id)).toEqual([rightA, rightB]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("adjacent block selection does not leave the card", () => {
    const { editor, reactEditor, leftA, leftB } = twoCards();
    const outline = navigationOutlineBlocks(editor, leftB);
    const current = { type: "block" as const, blockIds: [leftB], anchorBlockId: leftB, focusBlockId: leftB };
    expect(adjacentBlockSelection(outline, current, "down")).toEqual(current);
    expect(adjacentBlockSelection(outline, current, "up").focusBlockId).toBe(leftA);
    reactEditor.destroy();
    editor.destroy();
  });

  test("keyboard move placement refuses to cross into another card", () => {
    const { editor, reactEditor, leftA, leftB } = twoCards();
    const outline = navigationOutlineBlocks(editor, leftB);
    expect(keyboardMovePlacement(outline, [leftB], "down")).toBeUndefined();
    expect(keyboardMovePlacement(outline, [leftA], "up")).toBeUndefined();
    expect(keyboardMovePlacement(outline, [leftB], "up")).toEqual({
      targetId: leftA,
      position: "before",
    });
    reactEditor.destroy();
    editor.destroy();
  });

  test("pageEntries on a card outline excludes other cards", () => {
    const { editor, reactEditor, leftA, leftB } = twoCards();
    const ids = pageEntries(navigationOutlineBlocks(editor, leftA)).map(({ block }) => block.id);
    expect(ids).toEqual([leftA, leftB]);
    reactEditor.destroy();
    editor.destroy();
  });
});
