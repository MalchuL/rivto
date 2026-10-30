import { drawingResizeProps, padDrawingFrame } from "./drawing-frame";

describe("padDrawingFrame", () => {
  test("pads the path AABB by half stroke width in canvas units", () => {
    const result = padDrawingFrame(
      [
        { x: 10, y: 20 },
        { x: 40, y: 20 },
      ],
      8,
      1,
    );
    expect(result.frame).toEqual({ x: 6, y: 16, width: 38, height: 9 });
    expect(result.points[0]).toEqual({ x: 4, y: 4 });
    expect(result.points[1]).toEqual({ x: 34, y: 4 });
  });

  test("scales padding with zoom for non-scaling strokes", () => {
    const result = padDrawingFrame(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      8,
      2,
    );
    expect(result.frame.x).toBe(-2);
    expect(result.frame.width).toBe(14);
  });
});

describe("drawingResizeProps", () => {
  const drawing = {
    type: "drawing",
    frame: { x: 10, y: 20, width: 100, height: 50 },
    props: {
      points: [
        { x: 10, y: 5, pressure: 0.4 },
        { x: 90, y: 45 },
      ],
      strokeWidth: 4,
    },
  };

  test("scales both coordinates without mutating the source or scaling pressure", () => {
    expect(drawingResizeProps(drawing, { width: 200, height: 25 })).toEqual({
      points: [
        { x: 20, y: 2.5, pressure: 0.4 },
        { x: 180, y: 22.5 },
      ],
    });
    expect(drawing.props.points[0]).toEqual({ x: 10, y: 5, pressure: 0.4 });
    expect(drawingResizeProps(drawing, { width: 200 })).toEqual({
      points: [
        { x: 20, y: 5, pressure: 0.4 },
        { x: 180, y: 45 },
      ],
    });
  });

  test("does not rewrite points for movement or another element type", () => {
    expect(drawingResizeProps(drawing, { x: 50, y: 80 })).toEqual({});
    expect(drawingResizeProps({ ...drawing, type: "rectangle" }, { width: 200 })).toEqual({});
  });
});
