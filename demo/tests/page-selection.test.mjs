import assert from "node:assert/strict";
import test from "node:test";
import {
  adjacentBlockSelection,
  blockSelection,
  extendBlockSelection,
  keyboardMovePlacement,
  pageEntries,
  reconcileCollapsedSelection,
  selectedMoveRoots,
  toggleBlockSelection,
} from "../../packages/react-rivto-editor/src/extensions/page/page-selection-utils.ts";

const block = (id, children = [], collapsed = false) => ({
  id,
  type: "paragraph",
  listProps: { collapsed },
  content: id,
  props: {},
  pluginData: {},
  children,
});
const isCollapsed = (candidate) => candidate.listProps.collapsed === true;

test("visible traversal stops at collapsed parents", () => {
  const blocks = [block("a", [block("hidden", [block("deep")])], true), block("b")];
  assert.deepEqual(pageEntries(blocks).map(({ block: entry }) => entry.id), ["a", "hidden", "deep", "b"]);
  assert.deepEqual(pageEntries(blocks, null, false, isCollapsed).map(({ block: entry }) => entry.id), ["a", "b"]);
  assert.deepEqual(blockSelection(blocks, "a", "b", isCollapsed).blockIds, ["a", "b"]);
  assert.deepEqual(
    pageEntries(blocks, null, true, isCollapsed).map(({ block: entry }) => entry.id),
    ["a", "hidden", "deep", "b"],
  );
  assert.deepEqual(toggleBlockSelection(blocks, undefined, "deep", true, isCollapsed)?.blockIds, ["deep"]);
});

test("maps hidden text and block selections to the nearest collapsed parent", () => {
  const blocks = [block("a", [block("hidden"), block("also-hidden")], true), block("b")];
  assert.deepEqual(reconcileCollapsedSelection(blocks, [{
    type: "text",
    anchor: { blockId: "hidden", offset: 2 },
    head: { blockId: "hidden", offset: 2 },
  }]), [{
    type: "block",
    blockIds: ["a"],
    anchorBlockId: "a",
    focusBlockId: "a",
  }]);
  assert.deepEqual(reconcileCollapsedSelection(blocks, [{
    type: "block",
    blockIds: ["hidden", "b", "also-hidden"],
    anchorBlockId: "hidden",
    focusBlockId: "b",
  }]), [{
    type: "block",
    blockIds: ["a", "b"],
    anchorBlockId: "a",
    focusBlockId: "b",
  }]);
});

test("toggles non-contiguous blocks in visible order", () => {
  const blocks = [block("a"), block("b"), block("c")];
  const first = toggleBlockSelection(blocks, undefined, "a");
  const third = toggleBlockSelection(blocks, first, "c");
  assert.deepEqual(third, {
    type: "block",
    blockIds: ["a", "c"],
    anchorBlockId: "a",
    focusBlockId: "c",
  });
  assert.deepEqual(toggleBlockSelection(blocks, third, "a"), {
    type: "block",
    blockIds: ["c"],
    anchorBlockId: "c",
    focusBlockId: "c",
  });
});

test("extends, shrinks, and moves directed block selections", () => {
  const blocks = [block("a"), block("b"), block("c")];
  const selected = blockSelection(blocks, "b");
  const upward = extendBlockSelection(blocks, selected, "up");
  assert.deepEqual(upward.blockIds, ["a", "b"]);
  assert.equal(upward.anchorBlockId, "b");
  assert.equal(upward.focusBlockId, "a");
  assert.deepEqual(extendBlockSelection(blocks, upward, "down"), selected);
  assert.deepEqual(adjacentBlockSelection(blocks, upward, "down"), blockSelection(blocks, "c"));
});

test("groups selected top-level roots only when they are siblings", () => {
  const blocks = [block("a", [block("child")]), block("b"), block("c")];
  const selection = [{
    type: "block",
    blockIds: ["a", "child", "c"],
    anchorBlockId: "a",
    focusBlockId: "c",
  }];
  assert.deepEqual(selectedMoveRoots(blocks, selection, "c"), {
    ids: ["a", "c"],
    grouped: true,
    selection: selection[0],
  });

  const mixed = [{ ...selection[0], blockIds: ["child", "c"], anchorBlockId: "child" }];
  assert.deepEqual(selectedMoveRoots(blocks, mixed, "child"), { ids: ["child"], grouped: false });
});

test("resolves sibling swaps and parent-boundary moves", () => {
  const blocks = [block("parent", [block("a"), block("b")]), block("after")];
  assert.deepEqual(keyboardMovePlacement(blocks, ["b"], "up"), {
    targetId: "a", position: "before",
  });
  assert.deepEqual(keyboardMovePlacement(blocks, ["a"], "up"), {
    targetId: "parent", position: "before",
  });
  assert.deepEqual(keyboardMovePlacement(blocks, ["b"], "down"), {
    targetId: "parent", position: "after",
  });
  assert.equal(keyboardMovePlacement([block("parent", [block("b")])], ["b"], "down"), undefined);
});
