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

/**
 * Two root boards separated by a 4px outline gap. Each board's lanes stop
 * 22px above the board's bottom edge, leaving the board's own padding.
 */
function stackedBoards(): PointerDropCandidate[] {
  const board = (id: string, top: number, lanes: readonly string[]): PointerDropCandidate[] => [
    candidate(id, rect(top + 2, 24, 0, 600), {
      block: rect(top, 230, 0, 600),
      acceptsDropContainer: true,
      dropAxis: "horizontal",
      childOutline: "fixed",
    }),
    ...lanes.map((lane, index) => candidate(lane, rect(top + 34, 32, 24 + index * 280, 264), {
      block: rect(top + 22, 186, 24 + index * 280, 264),
      acceptsDropContainer: true,
      ancestorIds: [id],
      dropAxis: "vertical",
      childOutline: "free",
    })),
  ];
  return [
    ...board("board-a", 0, ["lane-a1", "lane-a2"]),
    ...board("board-b", 234, ["lane-b1", "lane-b2"]),
    candidate("after", rect(470, 24, 0, 600)),
  ];
}

test("the gap between two stacked containers is the next container's edge, not its field", () => {
  const boards = stackedBoards();
  // Board A ends at 230, board B starts at 234: the gap is nearest B's header.
  expect(pickPointerDropTarget(boards, { x: 300, y: 232 })).toEqual({ id: "board-b", reason: "chrome" });
  // The top border strip above B's header row is also B's edge.
  expect(pickPointerDropTarget(boards, { x: 300, y: 235 })).toEqual({ id: "board-b", reason: "chrome" });
});

test("a structural container's own trailing padding is its after edge, not the nearest lane", () => {
  const boards = stackedBoards();
  // Lanes end at 208; the board keeps 22px of padding down to 230.
  expect(pickPointerDropTarget(boards, { x: 300, y: 220 })).toEqual({ id: "board-a", reason: "chrome" });
  // Between lanes above their bottom edge, the padding belongs to the lanes.
  expect(pickPointerDropTarget(boards, { x: 292, y: 150 })).toEqual({ id: "lane-a1", reason: "nearby-row" });
  // A field-owning lane keeps its own body; the band applies only to fixed outlines.
  expect(pickPointerDropTarget(boards, { x: 100, y: 200 })).toEqual({ id: "lane-a1", reason: "container" });
});

test("a gap beside a structural root in the page margin resolves to that root's edge", () => {
  const boards = stackedBoards();
  expect(pickPointerDropTarget(boards, { x: -20, y: 10 })).toEqual({ id: "board-a", reason: "chrome" });
});

test("the trailing padding of an unaccepting fixed layout still ends at its after edge", () => {
  const columns = candidate("columns", rect(2, 24, 0, 600), {
    block: rect(0, 136, 0, 600),
    acceptsDropContainer: false,
    dropAxis: "horizontal",
    childOutline: "fixed",
  });
  // A filled column hides its own row; only its writing child has one.
  const column = candidate("column", rect(6, 0, 8, 0), {
    block: rect(6, 40, 8, 276),
    acceptsDropContainer: true,
    ancestorIds: ["columns"],
    childOutline: "free",
  });
  const writing = candidate("writing", rect(12, 24, 32, 252), {
    block: rect(12, 28, 32, 252),
    ancestorIds: ["column", "columns"],
  });
  const table = candidate("table", rect(142, 24, 0, 600), {
    block: rect(140, 134, 0, 600),
    acceptsDropContainer: true,
    dropAxis: "vertical",
    childOutline: "fixed",
  });
  expect(pickPointerDropTarget([columns, column, writing, table], { x: 300, y: 133 }))
    .toEqual({ id: "columns", reason: "chrome" });
  expect(pickPointerDropTarget([columns, column, writing, table], { x: 300, y: 138 }))
    .toEqual({ id: "table", reason: "chrome" });
});

test("a grid's wrap gap under a tile stays that tile's gap; only the far padding is the board edge", () => {
  const bento = candidate("bento", rect(2, 24, 0, 600), {
    block: rect(0, 166, 0, 600),
    acceptsDropContainer: true,
    dropAxis: "grid",
    childOutline: "fixed",
  });
  const tile = candidate("tile", rect(35, 96, 24, 400), {
    block: rect(22, 122, 24, 400),
    ancestorIds: ["bento"],
  });
  // 8px under the tile is within the nearby-row distance of its row.
  expect(pickPointerDropTarget([bento, tile], { x: 200, y: 152 }))
    .toEqual({ id: "tile", reason: "nearby-row" });
  // Farther than that, the board's padding is its own after edge.
  expect(pickPointerDropTarget([bento, tile], { x: 200, y: 160 }))
    .toEqual({ id: "bento", reason: "chrome" });
});

test("an empty fixed layout keeps its whole body as the field, including the bottom band", () => {
  const bento = candidate("bento", rect(2, 24, 0, 600), {
    block: rect(0, 128, 0, 600),
    acceptsDropContainer: true,
    dropAxis: "grid",
    childOutline: "fixed",
  });
  expect(pickPointerDropTarget([bento], { x: 300, y: 108 }))
    .toEqual({ id: "bento", reason: "container" });
});

test("a fixed shell nested in another fixed outline keeps its descendant fields", () => {
  const table = candidate("table", rect(2, 24, 0, 600), {
    block: rect(0, 134, 0, 600),
    acceptsDropContainer: true,
    dropAxis: "vertical",
    childOutline: "fixed",
  });
  const row = candidate("row", rect(8, 24, 9, 590), {
    block: rect(8, 120, 9, 590),
    acceptsDropContainer: true,
    ancestorIds: ["table"],
    dropAxis: "horizontal",
    childOutline: "fixed",
  });
  const cell = candidate("cell", rect(46, 24, 17, 180), {
    block: rect(36, 84, 17, 180),
    acceptsDropContainer: true,
    ancestorIds: ["row", "table"],
    childOutline: "free",
  });
  // The 8px strip under the cells belongs to the row, whose parent outline is fixed.
  expect(pickPointerDropTarget([table, row, cell], { x: 100, y: 124 }))
    .toEqual({ id: "cell", reason: "nearby-row" });
  // The table's own padding below its rows is the table's after edge.
  expect(pickPointerDropTarget([table, row, cell], { x: 100, y: 131 }))
    .toEqual({ id: "table", reason: "chrome" });
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

test("a page block over a bento tile uses grid edges and may nest in its center", () => {
  expect(hitDropIntent({ reason: "row", parentAxis: "grid" })).toBe("axis-grid");
  expect(hitDropIntent({ reason: "nearby-row", parentAxis: "grid" })).toBe("axis-grid");
});

test("a fixed grid keeps sibling edges while allowing a center nest", () => {
  const tile = rect(0, 80, 0, 180);
  expect(resolveGridPlacement("tile", tile, 90, 40, 8, true).position).toBe("inside");
  expect(resolveGridPlacement("tile", tile, 4, 40, 8, true).position).toBe("before");
});
