/** Regression coverage for block and edgeless outline navigation boundaries. */
import { createTestCoreEditor as createRivtoEditor } from "../../../../../test-utils";
import { createReactEditor } from "../../../../../react-editor";
import { SEPARATOR_BLOCK_TYPE, separatorBlockExtension } from "../../../separator/separator-block";
import {
  adjacentBlockSelection,
  blockSelection,
  extendBlockSelection,
  toggleBlockSelection,
} from "./block-selection";
import { reconcileCollapsedSelection } from "./collapsed-selection";
import { keyboardMovePlacement } from "./move-placement";
import { selectedMoveRoots } from "./move-roots";
import { pageEntries } from "./outline";
import { createStructuralSelection, type EditorBlock, type Selection } from "@chulane/rivto";
import {
  navigationOutlineBlocks,
  owningBlockElement,
} from "./scope";

/**
 * Creates a minimal portable block tree for pure outline calculations.
 *
 * @param id - Stable test block identifier.
 * @param children - Nested test blocks.
 * @param collapsed - Whether descendants are hidden from visible traversal.
 * @returns Complete block snapshot accepted by navigation utilities.
 */
function outlineBlock(
  id: string,
  children: EditorBlock[] = [],
  collapsed = false,
): EditorBlock {
  return {
    id,
    type: "paragraph",
    listProps: { collapsed },
    content: id,
    props: {},
    pluginData: {},
    children,
  };
}

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
    const current = createStructuralSelection([leftB], leftB, leftB);
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

describe("portable outline selection", () => {
  test("visible traversal and ranges stop at collapsed parents", () => {
    const blocks = [
      outlineBlock("a", [outlineBlock("hidden", [outlineBlock("deep")])], true),
      outlineBlock("b"),
    ];
    const isCollapsed = (block: EditorBlock) => block.listProps.collapsed === true;

    expect(pageEntries(blocks).map(({ block }) => block.id)).toEqual(["a", "hidden", "deep", "b"]);
    expect(pageEntries(blocks, null, false, isCollapsed).map(({ block }) => block.id)).toEqual(["a", "b"]);
    expect(blockSelection(blocks, "a", "b", isCollapsed).blocks.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(toggleBlockSelection(blocks, undefined, "deep", true, isCollapsed)?.blocks.map(({ id }) => id))
      .toEqual(["deep"]);
  });

  test("collapse reconciliation maps hidden selections to their visible ancestor", () => {
    const blocks = [outlineBlock("a", [outlineBlock("hidden"), outlineBlock("also-hidden")], true), outlineBlock("b")];
    const hiddenCaret: Selection = {
      type: "selection",
      blocks: [{ id: "hidden", start: 2, end: 2 }],
      anchorBlockId: "hidden",
      focusBlockId: "hidden",
    };

    expect(reconcileCollapsedSelection(blocks, hiddenCaret)).toEqual(createStructuralSelection(["a"]));
    expect(reconcileCollapsedSelection(
      blocks,
      createStructuralSelection(["hidden", "b", "also-hidden"], "hidden", "b"),
    )).toEqual(createStructuralSelection(["a", "b"], "a", "b"));
  });

  test("toggle and extension preserve portable directed selection", () => {
    const blocks = [outlineBlock("a"), outlineBlock("b"), outlineBlock("c")];
    const first = toggleBlockSelection(blocks, undefined, "a");
    const third = toggleBlockSelection(blocks, first, "c");
    const selected = blockSelection(blocks, "b");
    const upward = extendBlockSelection(blocks, selected, "up");

    expect(third).toEqual(createStructuralSelection(["a", "c"]));
    expect(toggleBlockSelection(blocks, third, "a")).toEqual(createStructuralSelection(["c"]));
    expect(upward.blocks.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(upward).toMatchObject({ anchorBlockId: "b", focusBlockId: "a" });
    expect(extendBlockSelection(blocks, upward, "down")).toEqual(selected);
    expect(adjacentBlockSelection(blocks, upward, "down")).toEqual(blockSelection(blocks, "c"));
  });

  test("selected move roots group only sibling roots", () => {
    const blocks = [outlineBlock("a", [outlineBlock("child")]), outlineBlock("b"), outlineBlock("c")];
    const selection = createStructuralSelection(["a", "child", "c"], "a", "c");

    expect(selectedMoveRoots(blocks, selection, "c")).toEqual({
      ids: ["a", "c"], grouped: true, selection,
    });
    expect(selectedMoveRoots(
      blocks,
      createStructuralSelection(["child", "c"], "child", "c"),
      "child",
    )).toEqual({ ids: ["child"], grouped: false });
  });

  test("keyboard movement crosses nested parent boundaries", () => {
    const blocks = [outlineBlock("parent", [outlineBlock("a"), outlineBlock("b")]), outlineBlock("after")];

    expect(keyboardMovePlacement(blocks, ["b"], "up")).toEqual({ targetId: "a", position: "before" });
    expect(keyboardMovePlacement(blocks, ["a"], "up")).toEqual({ targetId: "parent", position: "before" });
    expect(keyboardMovePlacement(blocks, ["b"], "down")).toEqual({ targetId: "parent", position: "after" });
    expect(keyboardMovePlacement([outlineBlock("parent", [outlineBlock("b")])], ["b"], "down"))
      .toBeUndefined();
  });
});
