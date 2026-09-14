/**
 * Regression coverage for pointer drop targeting in outline gaps.
 *
 * @module
 */
import {
  pickPointerDropTarget,
  type PointerDropCandidate,
} from "./index";
import {
  hitDropIntent,
  resolveChromePlacement,
  resolveGridPlacement,
} from "../placement";

function rect(top: number, height: number, left = 0, width = 200): PointerDropCandidate["row"] {
  return { top, bottom: top + height, left, right: left + width };
}

function candidate(
  id: string,
  row: PointerDropCandidate["row"],
  options: Partial<Omit<PointerDropCandidate, "id" | "row">> = {},
): PointerDropCandidate {
  return {
    id,
    row,
    block: options.block ?? row,
    acceptsDropContainer: options.acceptsDropContainer ?? false,
    ancestorIds: options.ancestorIds ?? [],
    dropAxis: options.dropAxis,
    childOutline: options.childOutline,
  };
}

test("a pointer on a row targets that block so inside stays on the same line", () => {
  const a = candidate("a", rect(0, 32));
  const b = candidate("b", rect(48, 32));
  expect(pickPointerDropTarget([a, b], { x: 20, y: 16 })).toEqual({ id: "a", reason: "row" });
  expect(pickPointerDropTarget([a, b], { x: 20, y: 60 })).toEqual({ id: "b", reason: "row" });
});

test("a gap between outline blocks targets the nearest row, not a distant container", () => {
  const paragraph = candidate("p1", rect(0, 24));
  const next = candidate("p2", rect(40, 24));
  const kanban = candidate("kanban", rect(200, 32), {
    block: rect(200, 400),
    acceptsDropContainer: true,
  });
  expect(pickPointerDropTarget([paragraph, next, kanban], { x: 20, y: 32 }))
    .toEqual({ id: "p1", reason: "nearby-row" });
});

test("a gap between two sibling rows prefers the closer block", () => {
  const first = candidate("first", rect(0, 20));
  const second = candidate("second", rect(40, 20));
  expect(pickPointerDropTarget([first, second], { x: 20, y: 24 }))
    .toEqual({ id: "first", reason: "nearby-row" });
  expect(pickPointerDropTarget([first, second], { x: 20, y: 36 }))
    .toEqual({ id: "second", reason: "nearby-row" });
});

test("a gap between nested children does not snap inside the parent container", () => {
  const column = candidate("column", rect(0, 28), {
    block: rect(0, 200),
    acceptsDropContainer: true,
  });
  const cardA = candidate("card-a", rect(40, 24), { ancestorIds: ["column"] });
  const cardB = candidate("card-b", rect(80, 24), { ancestorIds: ["column"] });
  expect(pickPointerDropTarget([column, cardA, cardB], { x: 20, y: 68 }))
    .toEqual({ id: "card-a", reason: "nearby-row" });
});

test("an empty container body stays an inside target when no descendant row is nearby", () => {
  const column = candidate("column", rect(0, 28), {
    block: rect(0, 160),
    acceptsDropContainer: true,
  });
  expect(pickPointerDropTarget([column], { x: 40, y: 100 }))
    .toEqual({ id: "column", reason: "container" });
});

test("the gap above the first nested child uses the first child, not the parent board", () => {
  const board = candidate("board", rect(0, 28), {
    block: rect(0, 240),
    acceptsDropContainer: true,
  });
  const first = candidate("first", rect(48, 24), { ancestorIds: ["board"] });
  expect(pickPointerDropTarget([board, first], { x: 20, y: 40 }))
    .toEqual({ id: "first", reason: "nearby-row" });
});

test("the gap below the last nested child uses the last child, not the parent board", () => {
  const board = candidate("board", rect(0, 28), {
    block: rect(0, 160),
    acceptsDropContainer: true,
  });
  const last = candidate("last", rect(80, 24), { ancestorIds: ["board"] });
  const after = candidate("after", rect(180, 24));
  expect(pickPointerDropTarget([board, last, after], { x: 20, y: 112 }))
    .toEqual({ id: "last", reason: "nearby-row" });
  expect(pickPointerDropTarget([board, last, after], { x: 20, y: 172 }))
    .toEqual({ id: "after", reason: "nearby-row" });
});

test("space outside the first and last roots targets their boundary, not a container field", () => {
  const board = candidate("board", rect(0, 28), {
    block: rect(0, 160),
    acceptsDropContainer: true,
  });
  const column = candidate("column", rect(40, 28), {
    block: rect(40, 100),
    acceptsDropContainer: true,
    ancestorIds: ["board"],
  });
  expect(pickPointerDropTarget([board, column], { x: 20, y: -12 }))
    .toEqual({ id: "board", reason: "root-edge" });
  expect(pickPointerDropTarget([board, column], { x: 20, y: 172 }))
    .toEqual({ id: "board", reason: "root-edge" });
  expect(hitDropIntent({ reason: "root-edge", targetAcceptsDrop: true })).toBe("sibling-edge");
});

test("returns null when the surface has no measured blocks", () => {
  expect(pickPointerDropTarget([], { x: 0, y: 0 })).toBeNull();
});

/**
 * Filled kanban: title 0–32, columns start at 80. The strip under the title
 * is still inside the board rect but is not a column field.
 */
function filledKanban(): PointerDropCandidate[] {
  return [
    candidate("kanban", rect(0, 32, 0, 600), {
      block: rect(0, 400, 0, 600),
      acceptsDropContainer: true,
      dropAxis: "horizontal",
      childOutline: "fixed",
    }),
    candidate("col-a", rect(80, 28, 0, 280), {
      block: rect(80, 320, 0, 280),
      acceptsDropContainer: true,
      ancestorIds: ["kanban"],
      dropAxis: "vertical",
      childOutline: "free",
    }),
    candidate("col-b", rect(80, 28, 300, 280), {
      block: rect(80, 320, 300, 280),
      acceptsDropContainer: true,
      ancestorIds: ["kanban"],
      dropAxis: "vertical",
      childOutline: "free",
    }),
  ];
}

test("hovering a filled kanban title is chrome, not an inside-board row", () => {
  expect(pickPointerDropTarget(filledKanban(), { x: 40, y: 16 }))
    .toEqual({ id: "kanban", reason: "chrome" });
});

test("a little below a filled kanban title snaps to the nearest column, not inside the board", () => {
  // 16px under the title, 32px above the column headers — further than NEARBY_ROW_DROP_PX.
  expect(pickPointerDropTarget(filledKanban(), { x: 40, y: 48 }))
    .toEqual({ id: "col-a", reason: "nearby-row" });
});

test("an empty kanban body with no columns stays an inside-board target", () => {
  const emptyBoard = candidate("kanban", rect(0, 32, 0, 600), {
    block: rect(0, 200, 0, 600),
    acceptsDropContainer: true,
    dropAxis: "horizontal",
    childOutline: "fixed",
  });
  expect(pickPointerDropTarget([emptyBoard], { x: 80, y: 120 }))
    .toEqual({ id: "kanban", reason: "container" });
});

test("a filled bento title is chrome; the strip under it snaps to the nearest tile", () => {
  const board = candidate("bento", rect(0, 32, 0, 400), {
    block: rect(0, 240, 0, 400),
    acceptsDropContainer: true,
    dropAxis: "grid",
    childOutline: "fixed",
  });
  const tile = candidate("tile", rect(72, 80, 8, 180), {
    block: rect(72, 80, 8, 180),
    ancestorIds: ["bento"],
  });
  expect(pickPointerDropTarget([board, tile], { x: 40, y: 16 }))
    .toEqual({ id: "bento", reason: "chrome" });
  expect(pickPointerDropTarget([board, tile], { x: 40, y: 48 }))
    .toEqual({ id: "tile", reason: "nearby-row" });
  expect(pickPointerDropTarget([board, tile], { x: 360, y: 180 }))
    .toEqual({ id: "bento", reason: "container" });
});

test("a filled table title is chrome; the strip under it snaps to the nearest cell", () => {
  const table = candidate("table", rect(0, 28, 0, 400), {
    block: rect(0, 200, 0, 400),
    acceptsDropContainer: true,
    dropAxis: "vertical",
    childOutline: "fixed",
  });
  const row = candidate("row", rect(48, 40, 0, 400), {
    block: rect(48, 40, 0, 400),
    acceptsDropContainer: true,
    ancestorIds: ["table"],
    dropAxis: "horizontal",
    childOutline: "fixed",
  });
  const cell = candidate("cell", rect(48, 40, 0, 200), {
    block: rect(48, 40, 0, 200),
    acceptsDropContainer: true,
    ancestorIds: ["row", "table"],
    childOutline: "free",
  });
  expect(pickPointerDropTarget([table, row, cell], { x: 40, y: 14 }))
    .toEqual({ id: "table", reason: "chrome" });
  expect(pickPointerDropTarget([table, row, cell], { x: 40, y: 36 }))
    .toEqual({ id: "cell", reason: "nearby-row" });
});

test("chrome placement is before/after the board, never inside as a new column", () => {
  const row = rect(0, 32, 0, 600);
  expect(resolveChromePlacement("kanban", row, 8)).toEqual({
    targetId: "kanban",
    position: "before",
  });
  expect(resolveChromePlacement("kanban", row, 24)).toEqual({
    targetId: "kanban",
    position: "after",
  });
});

test("a writing block over a column or empty board enters the field instead of inserting a shell", () => {
  expect(hitDropIntent({ reason: "chrome" })).toBe("sibling-edge");
  expect(hitDropIntent({
    reason: "nearby-row",
    parentAxis: "horizontal",
    targetAcceptsDrop: true,
  })).toBe("inside-field");
  expect(hitDropIntent({ reason: "container", targetAcceptsDrop: true })).toBe("inside-field");
  expect(hitDropIntent({
    reason: "row",
    parentAxis: "grid",
    targetAcceptsDrop: true,
  })).toBe("inside-field");
  expect(hitDropIntent({
    reason: "nearby-row",
    parentAxis: "horizontal",
    activeAxis: "horizontal",
  })).toBe("axis-horizontal");
  expect(hitDropIntent({ reason: "row", parentAxis: "vertical" })).toBe("axis-vertical");
  expect(hitDropIntent({ reason: "row" })).toBe("geometry");
});

test("a page block over a bento tile uses the grid axis instead of nesting inside the tile", () => {
  expect(hitDropIntent({ reason: "row", parentAxis: "grid" })).toBe("axis-grid");
  expect(hitDropIntent({ reason: "nearby-row", parentAxis: "grid" })).toBe("axis-grid");
});

test("a fixed grid never nests on the tile center so page drops become sibling tiles", () => {
  const tile = rect(0, 80, 0, 180);
  expect(resolveGridPlacement("tile", tile, 90, 40, 8, false)).toEqual({
    targetId: "tile",
    position: "after",
  });
  expect(resolveGridPlacement("tile", tile, 90, 40, 8, true).position).toBe("inside");
  expect(resolveGridPlacement("tile", tile, 4, 40, 8, false).position).toBe("before");
});
