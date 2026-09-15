/**
 * Canonical page-drag gap identity and core-command translation.
 *
 * @module
 */
import {
  dropMoveTarget,
  excludeDropSubtrees,
  resolveBlockDropPlacementOptions,
  resolveAfterDropPlacement,
  resolveBeforeDropPlacement,
  resolveInsideDropPlacement,
  resolveSiblingAfterDropPlacement,
  type DropBlock,
} from "./utils";
import { resolveGeometryPlacement } from "./geometry";

const blocks: DropBlock[] = [
  {
    id: "parent",
    children: [
      { id: "first", children: [] },
      { id: "second", children: [] },
    ],
  },
  { id: "last", children: [] },
];

test("both neighboring edges resolve to one canonical gap", () => {
  expect(resolveAfterDropPlacement(blocks, "first", 0))
    .toEqual(resolveBeforeDropPlacement(blocks, "second"));
});

test("both sides of a dragged block resolve to its original gap", () => {
  const siblings: DropBlock[] = [
    { id: "above", children: [] },
    { id: "dragged", children: [] },
    { id: "below", children: [] },
  ];
  const destinations = excludeDropSubtrees(siblings, new Set(["dragged"]));
  const fromAbove = resolveSiblingAfterDropPlacement(destinations, "above");
  const fromBelow = resolveBeforeDropPlacement(destinations, "below");
  expect(fromAbove).toEqual(fromBelow);
  expect(dropMoveTarget(fromAbove!)).toEqual({ targetId: "below", position: "before" });
});

test("translates start, middle, end, empty, root, and inside placements", () => {
  expect(dropMoveTarget(resolveBeforeDropPlacement(blocks, "first")!))
    .toEqual({ targetId: "first", position: "before" });
  expect(dropMoveTarget(resolveAfterDropPlacement(blocks, "first", 0)!))
    .toEqual({ targetId: "second", position: "before" });
  expect(dropMoveTarget(resolveSiblingAfterDropPlacement(blocks, "second")!))
    .toEqual({ targetId: "second", position: "after" });
  expect(dropMoveTarget(resolveAfterDropPlacement(blocks, "second", 1)!))
    .toEqual({ targetId: "second", position: "inside" });
  expect(dropMoveTarget(resolveAfterDropPlacement(blocks, "last", 0)!))
    .toEqual({ targetId: "last", position: "after" });
  expect(dropMoveTarget(resolveInsideDropPlacement("parent")))
    .toEqual({ targetId: "parent", position: "inside" });
});

test("block-view placement values override global defaults", () => {
  expect(resolveBlockDropPlacementOptions(24, 8, undefined, false)).toEqual({
    allowChildPlacement: false,
    childDropIndent: 24,
    gapDropZone: 8,
  });
  expect(resolveBlockDropPlacementOptions(24, 8, {
    allowChildPlacement: true,
    childDropIndent: 40,
    gapDropZone: 12,
  }, false)).toEqual({
    allowChildPlacement: true,
    childDropIndent: 40,
    gapDropZone: 12,
  });
  expect(resolveBlockDropPlacementOptions(24, 8, { gapDropZone: 12 }, false)).toEqual({
    allowChildPlacement: false,
    childDropIndent: 24,
    gapDropZone: 12,
  });
});

test("offers every structurally available depth after a final nested leaf", () => {
  const document: DropBlock[] = [{
    id: "A",
    children: [{ id: "B", children: [{ id: "C", children: [] }] }],
  }];

  expect(resolveAfterDropPlacement(document, "C", -2)).toEqual({
    kind: "between", parentId: null, previousId: "A", nextId: null, depth: 0,
  });
  expect(resolveAfterDropPlacement(document, "C", -1)).toEqual({
    kind: "between", parentId: "A", previousId: "B", nextId: null, depth: 1,
  });
  expect(resolveAfterDropPlacement(document, "C", 0)).toEqual({
    kind: "between", parentId: "B", previousId: "C", nextId: null, depth: 2,
  });
  expect(resolveAfterDropPlacement(document, "C", 1)).toEqual({
    kind: "between", parentId: "C", previousId: null, nextId: null, depth: 3,
  });
});

test("fractional left bands after a final nested row outdent with floor semantics", () => {
  const document: DropBlock[] = [{
    id: "A",
    children: [{ id: "B", children: [{ id: "C", children: [] }] }],
  }];
  const row = { id: "C", rect: { top: 0, bottom: 30, left: 48, height: 30 } };
  const options = { allowChildPlacement: true, childDropIndent: 24, gapDropZone: 8 };

  expect(resolveGeometryPlacement(document, row, 36, 28, options)).toMatchObject({
    kind: "between", parentId: "A", previousId: "B", nextId: null, depth: 1,
  });
  expect(resolveGeometryPlacement(document, row, 12, 28, options)).toMatchObject({
    kind: "between", parentId: null, previousId: "A", nextId: null, depth: 0,
  });
  expect(resolveGeometryPlacement(document, row, 72, 28, options)).toMatchObject({
    kind: "between", parentId: "C", previousId: null, nextId: null, depth: 3,
  });
});

test("keeps a gap at sibling depth when later siblings prevent outdenting", () => {
  const document: DropBlock[] = [{
    id: "A",
    children: [{
      id: "B",
      children: [{ id: "C", children: [] }, { id: "E", children: [] }],
    }],
  }];

  expect(resolveAfterDropPlacement(document, "C", -10)).toEqual({
    kind: "between", parentId: "B", previousId: "C", nextId: "E", depth: 2,
  });
});

test("maps parent gaps to the start of existing or empty child lists", () => {
  const populated: DropBlock[] = [{
    id: "A",
    children: [{ id: "B", children: [] }, { id: "C", children: [] }],
  }];

  expect(resolveAfterDropPlacement(populated, "A", 1)).toEqual({
    kind: "between", parentId: "A", previousId: null, nextId: "B", depth: 1,
  });
  expect(resolveAfterDropPlacement([{ id: "A", children: [] }], "A", 1)).toEqual({
    kind: "between", parentId: "A", previousId: null, nextId: null, depth: 1,
  });
  expect(resolveAfterDropPlacement(populated, "missing", 0)).toBeUndefined();
});
