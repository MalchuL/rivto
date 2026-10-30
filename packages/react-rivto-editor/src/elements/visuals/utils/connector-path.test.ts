import { connectorFrame, connectorPath, connectorPoints } from "./connector-path";

for (const route of ["straight", "orthogonal", "curve"] as const) {
  test(`draws a visible ${route} loop for coincident endpoints`, () => {
    const point = { x: 120, y: 180 };
    const points = connectorPoints(point, point, route);
    expect(points[0]).toEqual(point);
    expect(points.at(-1)).toEqual(point);
    const frame = connectorFrame(point, point, undefined, undefined, route);
    expect(frame.width).toBeGreaterThan(1);
    expect(frame.height).toBeGreaterThan(1);
    expect(connectorPath(point, point, route)).not.toMatch(/NaN|Infinity/);
  });

  test.each([NaN, Infinity, -Infinity, Number.MAX_VALUE])(
    `omits invalid ${route} SVG geometry for %s`,
    (coordinate) => {
      const source = { x: coordinate, y: 0 };
      const target = { x: -coordinate, y: 40 };
      expect(connectorPath(source, target, route)).toBe("");
    },
  );
}
