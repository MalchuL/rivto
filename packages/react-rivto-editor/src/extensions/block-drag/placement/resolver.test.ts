/**
 * Verifies placement resolution through the library-independent input shape.
 *
 * The provider adapts pointer and keyboard gestures into `DropPlacementInput`,
 * so these tests pin the geometry rules that depend only on Rivto data: pointer
 * row halves, keyboard stand-in rects, chrome edges, accepting fields, and the
 * fixed-layout axes.
 *
 * @module
 */
import { resolveDropPlacement } from "./resolver";
import { dropMoveTarget } from "./utils";
import type { DropBlock, DropPlacementInput, ViewportRect } from "./types";

const blocks: DropBlock[] = [
  { id: "first", children: [] },
  {
    id: "board",
    children: [
      { id: "lane-a", children: [{ id: "card", children: [] }] },
      { id: "lane-b", children: [] },
    ],
  },
  { id: "last", children: [] },
];

/**
 * Builds a viewport rectangle from its edges.
 *
 * @param top - Top edge in viewport pixels.
 * @param left - Left edge in viewport pixels.
 * @param width - Rectangle width.
 * @param height - Rectangle height.
 * @returns Rectangle with derived right and bottom edges.
 */
function rect(top: number, left: number, width: number, height: number): ViewportRect {
  return { top, left, width, height, right: left + width, bottom: top + height };
}

/**
 * Builds a placement input for a pointer gesture over one target row.
 *
 * @param targetId - Hovered block.
 * @param targetRect - Measured target rectangle.
 * @param data - Optional target layout data.
 * @returns Input with a cursor-driven source lacking a stand-in rect.
 */
function pointerInput(
  targetId: string,
  targetRect: ViewportRect,
  data: DropPlacementInput["target"]["data"] = { sortChildren: undefined },
): DropPlacementInput {
  return {
    source: { id: "last", data: { sortChildren: undefined }, rect: null },
    target: { id: targetId, rect: targetRect, data },
  };
}

test("pointer row halves resolve inside, before, and after placements", () => {
  const row = rect(100, 40, 400, 30);
  const input = pointerInput("first", row);

  const inside = resolveDropPlacement(input, blocks, 24, 8, true, { x: 60, y: 115 });
  expect(inside?.kind).toBe("inside");
  expect(dropMoveTarget(inside!)).toEqual({ targetId: "first", position: "inside" });

  const before = resolveDropPlacement(input, blocks, 24, 8, true, { x: 60, y: 102 });
  expect(dropMoveTarget(before!)).toEqual({ targetId: "first", position: "before" });
  expect(before?.kind === "between" && before.gapPointer).toEqual({ x: 60, y: 102 });

  const after = resolveDropPlacement(input, blocks, 24, 8, true, { x: 60, y: 128 });
  expect(dropMoveTarget(after!)).toEqual({ targetId: "board", position: "before" });
});

test("pointer nesting is refused when the global policy forbids children", () => {
  const input = pointerInput("first", rect(100, 40, 400, 30));
  const placement = resolveDropPlacement(input, blocks, 24, 8, false, { x: 60, y: 115 });
  expect(placement?.kind).toBe("between");
});

test("keyboard stand-in rect chooses row halves without nesting", () => {
  const targetRect = rect(200, 40, 400, 30);
  const source = { id: "first", data: { sortChildren: undefined }, rect: rect(190, 40, 400, 30) };
  const upper = resolveDropPlacement({ source, target: { id: "last", rect: targetRect, data: undefined } }, blocks, 24, 8, true, null);
  expect(dropMoveTarget(upper!)).toEqual({ targetId: "last", position: "before" });
  expect(upper?.kind === "between" && upper.gapPointer).toBeUndefined();

  const lowerSource = { ...source, rect: rect(210, 40, 400, 30) };
  const lower = resolveDropPlacement({ source: lowerSource, target: { id: "last", rect: targetRect, data: undefined } }, blocks, 24, 8, true, null);
  expect(dropMoveTarget(lower!)).toEqual({ targetId: "last", position: "after" });
});

test("fixed-layout chrome resolves to sibling edges instead of inside", () => {
  const input = pointerInput("board", rect(100, 40, 400, 30), {
    sortChildren: undefined,
    hitReason: "chrome",
    targetAcceptsDrop: true,
  });
  const upper = resolveDropPlacement(input, blocks, 24, 8, true, { x: 60, y: 105 });
  expect(dropMoveTarget(upper!)).toEqual({ targetId: "board", position: "before" });

  // The lower half resolves to "after board", whose canonical gap is "before last".
  const lower = resolveDropPlacement(input, blocks, 24, 8, true, { x: 60, y: 125 });
  expect(dropMoveTarget(lower!)).toEqual({ targetId: "last", position: "before" });
});

test("accepting fields receive the drop inside and respect target overrides", () => {
  const data = { sortChildren: undefined, hitReason: "container" as const, targetAcceptsDrop: true };
  const inside = resolveDropPlacement(pointerInput("lane-b", rect(100, 40, 200, 300), data), blocks, 24, 8, true, { x: 60, y: 200 });
  expect(dropMoveTarget(inside!)).toEqual({ targetId: "lane-b", position: "inside" });

  const refused = resolveDropPlacement(
    pointerInput("lane-b", rect(100, 40, 200, 300), { ...data, targetDropPlacement: { allowChildPlacement: false } }),
    blocks,
    24,
    8,
    true,
    { x: 60, y: 200 },
  );
  expect(refused).toBeNull();
});

test("horizontal lanes split on the target's vertical center line", () => {
  const laneRect = rect(100, 40, 200, 300);
  const data = { sortChildren: "horizontal" as const, parentChildOutline: "fixed" as const };
  const before = resolveDropPlacement(pointerInput("lane-b", laneRect, data), blocks, 24, 8, true, { x: 60, y: 200 });
  expect(dropMoveTarget(before!)).toEqual({ targetId: "lane-b", position: "before" });
  expect(before?.layoutAxis).toBe("horizontal");

  const after = resolveDropPlacement(pointerInput("lane-b", laneRect, data), blocks, 24, 8, true, { x: 220, y: 200 });
  expect(dropMoveTarget(after!)).toEqual({ targetId: "lane-b", position: "after" });
});

test("grid tiles nest at the center and sort along their rims", () => {
  const tile = rect(100, 100, 200, 200);
  const data = { sortChildren: "grid" as const, parentChildOutline: "fixed" as const };
  const nested = resolveDropPlacement(pointerInput("lane-a", tile, data), blocks, 24, 8, true, { x: 200, y: 200 });
  expect(dropMoveTarget(nested!)).toEqual({ targetId: "lane-a", position: "inside" });

  const rim = resolveDropPlacement(pointerInput("lane-a", tile, data), blocks, 24, 8, true, { x: 200, y: 296 });
  expect(dropMoveTarget(rim!)).toEqual({ targetId: "lane-b", position: "before" });
  expect(rim?.layoutAxis).toBe("grid");
});

test("vertical fixed layouts sort whole items by the target's horizontal center line", () => {
  const item = rect(100, 40, 400, 120);
  const data = { sortChildren: "vertical" as const, parentChildOutline: "fixed" as const };
  const before = resolveDropPlacement(pointerInput("lane-a", item, data), blocks, 24, 8, true, { x: 60, y: 120 });
  expect(dropMoveTarget(before!)).toEqual({ targetId: "lane-a", position: "before" });

  // Below the center line the gap after lane-a is canonicalized as "before lane-b".
  const after = resolveDropPlacement(pointerInput("lane-a", item, data), blocks, 24, 8, true, { x: 60, y: 170 });
  expect(dropMoveTarget(after!)).toEqual({ targetId: "lane-b", position: "before" });
  expect(after?.layoutAxis).toBe("vertical");
});
