import { DemoAdapter } from "./demo-adapter";
import { BlockDragSources } from "../src/editor/drag-and-drop/block-drag-extension";
import { BlockSelectionRanges } from "../src/editor/selection/block-selection-ranges";
import { BlockDOMSelection } from "../src/editor/selection/block-dom-selection";

test("text coverage classifies unmounted contentless blocks and reads only its interval", () => {
  const ids = Array.from({ length: 1200 }, (_, index) => String(index));
  const getTextLength = jest.fn((id: string) => (id === "602" ? undefined : 0));
  const dom = new BlockDOMSelection({ getSelectableBlockIds: () => ids, getTextLength });
  const selection = dom.createSelection(
    { blockId: "603", offset: 0 },
    { blockId: "601", offset: 0 },
  );
  expect(selection?.blocks).toEqual([
    { id: "601", start: 0, end: 0 },
    { id: "602", start: 0, end: -1 },
    { id: "603", start: 0, end: 0 },
  ]);
  expect(getTextLength).toHaveBeenCalledTimes(3);
  expect(selection?.anchorBlockId).toBe("603");
});

test("normalizes mixed parents without DOM or descendant reads", () => {
  const adapter = new DemoAdapter(200);
  adapter.selection.set(
    BlockSelectionRanges.createStructuralSelection(["block-1", "child-0", "block-2", "child-199"]),
  );
  expect(BlockDragSources.get(adapter, "block-2")).toEqual(["block-1", "block-2", "child-199"]);
  expect(BlockDragSources.get(adapter, "block-3")).toEqual(["block-3"]);
});

test("moves hidden roots from different parents and publishes complete hierarchy", () => {
  const adapter = new DemoAdapter(200);
  const ids = ["child-0", "block-2", "child-199"];
  const observer = jest.fn(() => {
    expect(adapter.blocks.getBlockNode("block-3")?.childIds).toEqual(ids);
    expect(adapter.blocks.getBlockNode("block-1")?.childIds).toEqual([]);
    expect(adapter.blocks.getBlockNode("block-996")?.childIds).toEqual([]);
  });
  adapter.blocks.subscribeBlockNode("block-1", observer);
  expect(adapter.moveBlocks(ids, { kind: "inside", parentId: "block-3" })).toBe(true);
  expect(observer).toHaveBeenCalledTimes(1);
  expect(adapter.selection.get()?.blocks.map(({ id }) => id)).toEqual(ids);
  expect(adapter.blocks.getParentId("child-199")).toBe("block-3");
});

test("rejects cycles, stale gaps, missing sources and nested source groups without writes", () => {
  const adapter = new DemoAdapter(1);
  const roots = adapter.blocks.getBlockIds();
  expect(adapter.moveBlocks(["block-1"], { kind: "inside", parentId: "child-0" })).toBe(false);
  expect(adapter.moveBlocks(["missing"], { kind: "inside", parentId: "block-2" })).toBe(false);
  expect(adapter.moveBlocks(["block-1", "child-0"], { kind: "inside", parentId: "block-2" })).toBe(
    false,
  );
  expect(
    adapter.moveBlocks(["block-2"], {
      kind: "between",
      parentId: "block-1",
      previousId: "deleted",
      nextId: "child-0",
    }),
  ).toBe(false);
  expect(adapter.blocks.getBlockIds()).toBe(roots);
  expect(adapter.blocks.getBlockNode("block-1")?.childIds).toEqual(["child-0"]);
});

test("checks permission without writes and rechecks stale destinations at commit", () => {
  const adapter = new DemoAdapter(1);
  const roots = adapter.blocks.getRootIds();
  const destination = {
    kind: "between" as const,
    parentId: null,
    previousId: null,
    nextId: roots[0]!,
  };
  expect(adapter.canMove(["child-0"], destination)).toBe(true);
  expect(adapter.blocks.getRootIds()).toBe(roots);
  expect(adapter.selection.get()).toBeUndefined();
  expect(adapter.moveBlocks(["child-0"], destination)).toBe(true);
  expect(adapter.blocks.getRootIds()[0]).toBe("child-0");
  expect(adapter.blocks.getBlockNode("block-1")?.childIds).toEqual([]);
  expect(adapter.blocks.getParentId("child-0")).toBeUndefined();
  const changedRoots = adapter.blocks.getRootIds();
  expect(adapter.moveBlocks(["block-2"], destination)).toBe(false);
  expect(adapter.blocks.getRootIds()).toBe(changedRoots);
});
