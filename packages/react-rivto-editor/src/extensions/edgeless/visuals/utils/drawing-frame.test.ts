import { padDrawingFrame } from "./drawing-frame";

describe("padDrawingFrame", () => {
  test("pads the path AABB by half stroke width in canvas units", () => {
    const result = padDrawingFrame(
      [{ x: 10, y: 20 }, { x: 40, y: 20 }],
      8,
      1,
    );
    expect(result.frame).toEqual({ x: 6, y: 16, width: 38, height: 9 });
    expect(result.points[0]).toEqual({ x: 4, y: 4 });
    expect(result.points[1]).toEqual({ x: 34, y: 4 });
  });

  test("scales padding with zoom for non-scaling strokes", () => {
    const result = padDrawingFrame([{ x: 0, y: 0 }, { x: 10, y: 0 }], 8, 2);
    expect(result.frame.x).toBe(-2);
    expect(result.frame.width).toBe(14);
  });
});
