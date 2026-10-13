import {
  centeredPlaceFrame,
  snapDraggedFrame,
  snapPlacedFrame,
} from "./creation-geometry";

const snapping = {
  snapToGrid: true,
  alignObjects: true,
  grid: 20,
  threshold: 8,
};

describe("edgeless creation geometry", () => {
  test("centers remembered sizes and snaps fixed frames to objects before the grid", () => {
    expect(centeredPlaceFrame({ x: 100, y: 80 }, { width: 60, height: 40 }))
      .toEqual({ x: 70, y: 60, width: 60, height: 40 });
    expect(snapPlacedFrame(
      { x: 94, y: 20, width: 40, height: 40 },
      [{ x: 0, y: 0, width: 100, height: 60 }],
      snapping,
    )).toMatchObject({ frame: { x: 100, y: 20, width: 40, height: 40 } });
  });

  test("snaps forward and reverse drag anchors and moving edges to the grid", () => {
    expect(snapDraggedFrame({ x: 3, y: 7 }, { x: 54, y: 49 }, [], snapping).frame)
      .toEqual({ x: 0, y: 0, width: 60, height: 40 });
    expect(snapDraggedFrame({ x: 103, y: 107 }, { x: 52, y: 61 }, [], snapping).frame)
      .toEqual({ x: 60, y: 60, width: 40, height: 40 });
  });

  test("preserves square drags through snapping and bypasses snapping with Alt", () => {
    expect(snapDraggedFrame({ x: 0, y: 0 }, { x: 53, y: 31 }, [], snapping, true).frame)
      .toEqual({ x: 0, y: 0, width: 60, height: 60 });
    expect(snapDraggedFrame(
      { x: 3, y: 7 },
      { x: -20, y: 8 },
      [],
      { ...snapping, disabled: true },
      true,
    ).frame).toEqual({ x: -20, y: 7, width: 23, height: 23 });
  });

  test("enforces the minimum frame without affecting unconstrained axes", () => {
    expect(snapDraggedFrame(
      { x: 0, y: 0 },
      { x: 2, y: 40 },
      [],
      { ...snapping, snapToGrid: false, alignObjects: false },
    ).frame).toEqual({ x: 0, y: 0, width: 16, height: 40 });
  });
});
