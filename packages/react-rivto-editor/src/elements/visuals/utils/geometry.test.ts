import {
  applyCornerResize,
  connectorFrame,
  connectorLabelCssDegrees,
  connectorLabelPoint,
  connectorPath,
  connectorPoints,
  nearestAnchor,
  normalizeRotation,
  normalizeUprightLabelAngle,
  polylineCutsNodes,
  rotatePoint,
  segmentIntersectsFrame,
  segmentIntersectsRotatedFrame,
  snapFrame,
  snapMoveToGrid,
  snapResize,
  snapResizeToGrid,
  snapScalarToGrid,
} from "./geometry";

describe("edgeless visual geometry", () => {
  test.each([0, -0, 360, -720, NaN, Infinity, -Infinity])(
    "preserves point coordinates for identity rotation %s",
    (rotation) => {
      const point = { x: 0.1, y: -0.2 };
      const center = { x: 1e16, y: -1e16 };
      const rotated = rotatePoint(point, center, rotation);
      expect(rotated).toEqual(point);
      expect(rotated).not.toBe(point);
    },
  );

  test.each([90, -90, 450])("still rotates around the center for %s degrees", (rotation) => {
    const rotated = rotatePoint({ x: 12, y: 20 }, { x: 10, y: 20 }, rotation);
    expect(rotated.x).toBeCloseTo(10);
    expect(rotated.y).toBeCloseTo(rotation === -90 ? 18 : 22);
  });

  test.each([2, 200])("resolves %s unrotated connector anchors without trigonometry", (count) => {
    const originals = { sin: Math.sin, cos: Math.cos };
    let calls = 0;
    for (const method of ["sin", "cos"] as const) {
      Math[method] = (radians) => {
        calls++;
        return originals[method](radians);
      };
    }
    try {
      for (let index = 0; index < count; index++) {
        expect(nearestAnchor({ x: 20, y: 20, width: 100, height: 60 }, { x: 119, y: 50 })).toEqual({
          x: 1,
          y: 0.5,
        });
      }
      expect(calls).toBe(0);
    } finally {
      Object.assign(Math, originals);
    }
  });

  test("builds connector routes that leave node interiors", () => {
    const sourceFrame = { x: 0, y: 0, width: 40, height: 40 };
    const targetFrame = { x: 120, y: 0, width: 40, height: 40 };
    const source = { x: 40, y: 20 },
      target = { x: 120, y: 20 };
    const sourceAnchor = { x: 1, y: 0.5 },
      targetAnchor = { x: 0, y: 0.5 };
    const orthogonal = connectorPath(
      source,
      target,
      "orthogonal",
      sourceAnchor,
      targetAnchor,
      sourceFrame,
      targetFrame,
    );
    expect(orthogonal.startsWith("M 40 20")).toBe(true);
    expect(orthogonal).toContain(" L 120 20");
    expect(
      polylineCutsNodes(
        [
          { x: 20, y: 20 },
          { x: 100, y: 20 },
        ],
        sourceFrame,
        targetFrame,
      ),
    ).toBe(true);
    expect(
      connectorPath(source, target, "curve", sourceAnchor, targetAnchor, sourceFrame, targetFrame),
    ).toContain(" C ");
    expect(nearestAnchor({ x: 20, y: 20, width: 100, height: 60 }, { x: 119, y: 50 })).toEqual({
      x: 1,
      y: 0.5,
    });
    const frame = connectorFrame(
      source,
      target,
      sourceAnchor,
      targetAnchor,
      "orthogonal",
      sourceFrame,
      targetFrame,
    );
    expect(frame.width).toBeGreaterThanOrEqual(80);
    expect(
      connectorLabelPoint(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        "straight",
      ),
    ).toEqual({ x: 50, y: 0 });
    expect(normalizeUprightLabelAngle(180)).toBe(0);
    expect(normalizeUprightLabelAngle(0)).toBe(0);
    expect(normalizeUprightLabelAngle(45)).toBe(45);
    expect(normalizeUprightLabelAngle(225)).toBe(45);
    expect(
      connectorLabelCssDegrees(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        "straight",
        "along",
      ),
    ).toBe(0);
    expect(
      connectorLabelCssDegrees(
        [
          { x: 100, y: 0 },
          { x: 0, y: 0 },
        ],
        "straight",
        "along",
      ),
    ).toBe(0);
    expect(
      connectorLabelCssDegrees(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        "straight",
        "90",
      ),
    ).toBe(90);
  });

  test("prefers orthogonal elbows that break near the path center", () => {
    const sourceFrame = { x: 0, y: 0, width: 40, height: 40 };
    const targetFrame = { x: 160, y: 80, width: 40, height: 40 };
    const source = { x: 40, y: 20 };
    const target = { x: 160, y: 100 };
    const points = connectorPoints(
      source,
      target,
      "orthogonal",
      { x: 1, y: 0.5 },
      { x: 0, y: 0.5 },
      sourceFrame,
      targetFrame,
    );
    const exit = points[1]!;
    const entry = points[points.length - 2]!;
    const midX = (exit.x + entry.x) / 2;
    const hasCenterBreak = points.some((point, index) => {
      if (index === 0 || index === points.length - 1) {
        return false;
      }
      const next = points[index + 1];
      return next && Math.abs(point.x - next.x) < 0.5 && Math.abs(point.x - midX) < 0.5;
    });
    expect(hasCenterBreak).toBe(true);
  });
  test("snaps move and resize deltas onto the canvas grid", () => {
    expect(snapScalarToGrid(27, 20)).toBe(20);
    expect(snapScalarToGrid(31, 20)).toBe(40);
    expect(snapMoveToGrid({ x: 0, y: 0, width: 40, height: 40 }, 27, 14, 20)).toEqual({
      dx: 20,
      dy: 20,
    });
    expect(snapMoveToGrid({ x: 0, y: 0, width: 40, height: 40 }, 27, 14, 20, { x: true })).toEqual({
      dx: 27,
      dy: 20,
    });
    expect(snapResizeToGrid({ x: 0, y: 0, width: 40, height: 40 }, 27, 14, "se", 1, 1, 20)).toEqual(
      { dx: 20, dy: 20 },
    );
    expect(
      snapResizeToGrid({ x: 40, y: 40, width: 100, height: 80 }, -17, -13, "nw", 1, 1, 20),
    ).toEqual({ dx: -20, dy: -20 });
    expect(
      snapResizeToGrid({ x: 40, y: 40, width: 100, height: 80 }, -17, 14, "sw", 1, 1, 20),
    ).toEqual({ dx: -20, dy: 20 });
    expect(
      snapResizeToGrid({ x: 40, y: 40, width: 100, height: 80 }, 27, -13, "ne", 1, 1, 20),
    ).toEqual({ dx: 20, dy: -20 });
  });

  test("snaps edges and reports a zoom-independent guide", () => {
    const result = snapFrame(
      { x: 94, y: 30, width: 20, height: 20 },
      [{ x: 100, y: 0, width: 30, height: 30 }],
      8,
    );
    expect(result.dx).toBe(1);
    expect(result.guides).toContainEqual(expect.objectContaining({ axis: "x", position: 115 }));
  });

  test("detects eraser segment intersections", () => {
    const frame = { x: 20, y: 20, width: 30, height: 30 };
    expect(segmentIntersectsFrame({ x: 0, y: 35 }, { x: 80, y: 35 }, frame)).toBe(true);
    expect(segmentIntersectsFrame({ x: 0, y: 0 }, { x: 10, y: 10 }, frame)).toBe(false);
  });

  test("snaps the active lower-right resize handle", () => {
    expect(
      snapResize(
        { x: 0, y: 0, width: 95, height: 45 },
        2,
        3,
        [{ x: 100, y: 50, width: 20, height: 20 }],
        5,
      ),
    ).toMatchObject({ dx: 5, dy: 5 });
  });

  test("snaps moving left/top edges toward alignment targets", () => {
    const frame = { x: 40, y: 40, width: 100, height: 80 };
    expect(
      snapResize(frame, -18, -18, [{ x: 20, y: 20, width: 10, height: 10 }], 5, "nw"),
    ).toMatchObject({ dx: -20, dy: -20 });
    expect(
      snapResize(frame, -18, 0, [{ x: 20, y: 0, width: 10, height: 10 }], 5, "sw"),
    ).toMatchObject({ dx: -20, dy: 0 });
    expect(
      snapResize(frame, 0, -18, [{ x: 0, y: 20, width: 10, height: 10 }], 5, "ne"),
    ).toMatchObject({ dx: 0, dy: -20 });
  });

  test("resizes from each corner while keeping the opposite edges fixed", () => {
    const frame = { x: 40, y: 40, width: 100, height: 80 };
    expect(applyCornerResize(frame, 20, 10, "se", 1, 1)).toEqual({
      x: 40,
      y: 40,
      width: 120,
      height: 90,
    });
    expect(applyCornerResize(frame, -20, 10, "sw", 1, 1)).toEqual({
      x: 20,
      y: 40,
      width: 120,
      height: 90,
    });
    expect(applyCornerResize(frame, 20, -10, "ne", 1, 1)).toEqual({
      x: 40,
      y: 30,
      width: 120,
      height: 90,
    });
    expect(applyCornerResize(frame, -20, -10, "nw", 1, 1)).toEqual({
      x: 20,
      y: 30,
      width: 120,
      height: 90,
    });
  });

  test("resizes from edge centers on only one axis", () => {
    const frame = { x: 40, y: 40, width: 100, height: 80 };
    expect(applyCornerResize(frame, 20, 30, "e", 1, 1)).toEqual({
      x: 40,
      y: 40,
      width: 120,
      height: 80,
    });
    expect(applyCornerResize(frame, -20, 30, "w", 1, 1)).toEqual({
      x: 20,
      y: 40,
      width: 120,
      height: 80,
    });
    expect(applyCornerResize(frame, 20, -10, "n", 1, 1)).toEqual({
      x: 40,
      y: 30,
      width: 100,
      height: 90,
    });
    expect(applyCornerResize(frame, 20, 10, "s", 1, 1)).toEqual({
      x: 40,
      y: 40,
      width: 100,
      height: 90,
    });
  });

  test("normalizes angles", () => {
    expect(normalizeRotation(-15)).toBe(345);
    expect(normalizeRotation(375)).toBe(15);
  });

  test("uses rotated edges for connector anchors and eraser hits", () => {
    const frame = { x: 0, y: 0, width: 100, height: 40 };
    expect(nearestAnchor(frame, { x: 50, y: 70 }, 90)).toEqual({ x: 1, y: 0.5 });
    expect(segmentIntersectsRotatedFrame({ x: 50, y: -20 }, { x: 50, y: 80 }, frame, 90)).toBe(
      true,
    );
    expect(segmentIntersectsRotatedFrame({ x: 0, y: -40 }, { x: 10, y: -30 }, frame, 90)).toBe(
      false,
    );
  });

  test("prefers center alignment when edge and center deltas tie", () => {
    const result = snapFrame(
      { x: 52, y: 0, width: 100, height: 20 },
      [{ x: 50, y: 80, width: 100, height: 20 }],
      8,
    );
    expect(result.dx).toBe(-2);
    expect(result.guides).toContainEqual(expect.objectContaining({ axis: "x", position: 100 }));
  });

  test("builds snap guides from the snapped frame", () => {
    const result = snapFrame(
      { x: 52, y: 12, width: 100, height: 20 },
      [{ x: 50, y: 80, width: 100, height: 20 }],
      8,
    );
    const guide = result.guides.find((entry) => entry.axis === "x");
    expect(guide).toMatchObject({ position: 100, from: 12, to: 100 });
  });
});
