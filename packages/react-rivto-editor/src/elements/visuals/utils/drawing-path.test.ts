import { drawingPath } from "./drawing-path";

it("retains empty, single-point and two-point stroke geometry", () => {
  expect(drawingPath([])).toBe("");
  expect(drawingPath([{ x: 1, y: 2 }])).toBe("M1 2");
  expect(
    drawingPath([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]),
  ).toBe("M1 2 L3 4");
});

it("rounds bends through midpoints without changing endpoints or stored samples", () => {
  const points = Object.freeze([
    Object.freeze({ x: 0, y: 0 }),
    Object.freeze({ x: 10, y: 20 }),
    Object.freeze({ x: 20, y: 0 }),
    Object.freeze({ x: 30, y: 20 }),
  ]);
  expect(drawingPath(points)).toBe("M0 0 Q10 20 15 10 Q20 0 25 10 L30 20");
  expect(points[1]).toEqual({ x: 10, y: 20 });
});
