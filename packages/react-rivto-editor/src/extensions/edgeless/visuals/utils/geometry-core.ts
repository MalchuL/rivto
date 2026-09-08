import type { VisualFrame } from "../types";

export type Point = { x: number; y: number };

/** Outward unit normal for an edge-center attachment. */
export function anchorNormal(anchor: Point): Point {
  if (anchor.x <= 0) return { x: -1, y: 0 };
  if (anchor.x >= 1) return { x: 1, y: 0 };
  if (anchor.y <= 0) return { x: 0, y: -1 };
  if (anchor.y >= 1) return { x: 0, y: 1 };
  return { x: 0, y: 0 };
}

/** Inflates a frame uniformly (negative pad insets). */
export function inflateFrame(frame: VisualFrame, pad: number): VisualFrame {
  return { x: frame.x - pad, y: frame.y - pad, width: frame.width + pad * 2, height: frame.height + pad * 2 };
}

/** True when a canvas point lies inside a frame. */
export function pointInFrame(point: Point, frame: VisualFrame): boolean {
  return point.x >= frame.x && point.x <= frame.x + frame.width && point.y >= frame.y && point.y <= frame.y + frame.height;
}

/** True when a line segment intersects an axis-aligned frame. */
export function segmentIntersectsFrame(a: Point, b: Point, frame: VisualFrame): boolean {
  const inside = (point: Point) => point.x >= frame.x && point.x <= frame.x + frame.width && point.y >= frame.y && point.y <= frame.y + frame.height;
  if (inside(a) || inside(b)) return true;
  const lines = [
    [{ x: frame.x, y: frame.y }, { x: frame.x + frame.width, y: frame.y }],
    [{ x: frame.x + frame.width, y: frame.y }, { x: frame.x + frame.width, y: frame.y + frame.height }],
    [{ x: frame.x + frame.width, y: frame.y + frame.height }, { x: frame.x, y: frame.y + frame.height }],
    [{ x: frame.x, y: frame.y + frame.height }, { x: frame.x, y: frame.y }],
  ] as const;
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return lines.some(([c, d]) => cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0);
}
