import type { ConnectorRoute, VisualFrame } from "../types";
import { anchorNormal, inflateFrame, pointInFrame, segmentIntersectsFrame } from "./geometry-core";

export type Point = { x: number; y: number };

const OFFSET = 20;

const almost = (a: number, b: number) => Math.abs(a - b) < 0.5;

/** Path length of a polyline. */
export function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  }
  return total;
}

/** Point at fraction `t` (0–1) along a polyline. */
export function pointAlongPolyline(points: readonly Point[], t: number): Point {
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0]! };
  const total = pathLength(points);
  let remaining = total * Math.min(1, Math.max(0, t));
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= segment) {
      const u = segment ? remaining / segment : 0;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    remaining -= segment;
  }
  return { ...points[points.length - 1]! };
}

/** Midpoint of a cubic Bezier (t = 0.5). */
export function cubicBezierMidpoint(p0: Point, p1: Point, p2: Point, p3: Point): Point {
  return {
    x: 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x,
    y: 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y,
  };
}

/** Label anchor for a routed connector, in the same coordinate space as `points`. */
export function connectorLabelPoint(points: readonly Point[], route: ConnectorRoute): Point {
  if (route === "curve" && points.length >= 4) {
    return cubicBezierMidpoint(points[0]!, points[1]!, points[2]!, points[3]!);
  }
  return pointAlongPolyline(points, 0.5);
}

/** Drops colinear intermediate vertices. */
export function mergeColinear(points: readonly Point[]): Point[] {
  if (points.length < 3) return [...points];
  const result: Point[] = [points[0]!];
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = result[result.length - 1]!;
    const cur = points[index]!;
    const next = points[index + 1]!;
    if (almost(prev.x, cur.x) && almost(cur.x, next.x)) continue;
    if (almost(prev.y, cur.y) && almost(cur.y, next.y)) continue;
    result.push(cur);
  }
  result.push(points[points.length - 1]!);
  return result;
}

function exitPoint(point: Point, anchor: Point | undefined, other: Point): { point: Point; dir: Point } {
  let dir = anchor ? anchorNormal(anchor) : { x: 0, y: 0 };
  if (!dir.x && !dir.y) {
    const dx = other.x - point.x;
    const dy = other.y - point.y;
    dir = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
  }
  return { point: { x: point.x + dir.x * OFFSET, y: point.y + dir.y * OFFSET }, dir };
}

function segmentCutsInterior(a: Point, b: Point, frame: VisualFrame): boolean {
  const inset = inflateFrame(frame, -1);
  if (inset.width <= 0 || inset.height <= 0) return false;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return pointInFrame(mid, inset) || segmentIntersectsFrame(a, b, inset);
}

/** True when a polyline cuts through either node interior (endpoints on borders are fine). */
export function polylineCutsNodes(
  points: readonly Point[],
  sourceFrame?: VisualFrame,
  targetFrame?: VisualFrame,
): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    if (sourceFrame && segmentCutsInterior(a, b, sourceFrame)) return true;
    if (targetFrame && segmentCutsInterior(a, b, targetFrame)) return true;
  }
  return false;
}

function orthogonalCandidates(
  source: Point,
  target: Point,
  exit: Point,
  entry: Point,
  sourceFrame?: VisualFrame,
  targetFrame?: VisualFrame,
): Point[][] {
  const midX = (exit.x + entry.x) / 2;
  const midY = (exit.y + entry.y) / 2;
  // Prefer center breaks first: elbow near the midpoint between exit and entry.
  const candidates: Point[][] = [
    [source, exit, { x: midX, y: exit.y }, { x: midX, y: entry.y }, entry, target],
    [source, exit, { x: exit.x, y: midY }, { x: entry.x, y: midY }, entry, target],
    [source, exit, { x: entry.x, y: exit.y }, entry, target],
    [source, exit, { x: exit.x, y: entry.y }, entry, target],
  ];
  if (sourceFrame && targetFrame) {
    const pad = OFFSET;
    const left = Math.min(sourceFrame.x, targetFrame.x) - pad;
    const right = Math.max(sourceFrame.x + sourceFrame.width, targetFrame.x + targetFrame.width) + pad;
    const top = Math.min(sourceFrame.y, targetFrame.y) - pad;
    const bottom = Math.max(sourceFrame.y + sourceFrame.height, targetFrame.y + targetFrame.height) + pad;
    candidates.push(
      [source, exit, { x: exit.x, y: top }, { x: entry.x, y: top }, entry, target],
      [source, exit, { x: exit.x, y: bottom }, { x: entry.x, y: bottom }, entry, target],
      [source, exit, { x: left, y: exit.y }, { x: left, y: entry.y }, entry, target],
      [source, exit, { x: right, y: exit.y }, { x: right, y: entry.y }, entry, target],
    );
  }
  return candidates.map(mergeColinear);
}

/** Lower is better: prefers elbows that sit on the midpoint between exit and entry. */
function centerBreakCost(points: readonly Point[], exit: Point, entry: Point): number {
  const midX = (exit.x + entry.x) / 2;
  const midY = (exit.y + entry.y) / 2;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    if (almost(a.x, b.x) && almost(a.x, midX)) return 0;
    if (almost(a.y, b.y) && almost(a.y, midY)) return 0;
  }
  const along = pointAlongPolyline(points, 0.5);
  return Math.hypot(along.x - midX, along.y - midY);
}

function pickBest(
  candidates: Point[][],
  exit: Point,
  entry: Point,
  sourceFrame?: VisualFrame,
  targetFrame?: VisualFrame,
): Point[] {
  const viable = candidates
    .map((points) => ({
      points,
      length: pathLength(points),
      cuts: polylineCutsNodes(points, sourceFrame, targetFrame),
      center: centerBreakCost(points, exit, entry),
    }))
    .filter((candidate) => !candidate.cuts)
    .sort((left, right) =>
      left.center - right.center
      || left.length - right.length
      || left.points.length - right.points.length);
  return viable[0]?.points ?? candidates[0]!;
}

/**
 * Builds connector waypoints in absolute canvas space.
 * Routes avoid cutting through the two attached node frames (not other obstacles).
 */
export function connectorPoints(
  source: Point,
  target: Point,
  route: ConnectorRoute,
  sourceAnchor?: Point,
  targetAnchor?: Point,
  sourceFrame?: VisualFrame,
  targetFrame?: VisualFrame,
): Point[] {
  const start = exitPoint(source, sourceAnchor, target);
  const end = exitPoint(target, targetAnchor, source);
  const exit = start.point;
  const entry = end.point;

  if (route === "curve") {
    const distance = Math.hypot(target.x - source.x, target.y - source.y);
    const bend = Math.max(OFFSET * 2, distance / 3);
    return [
      source,
      { x: source.x + start.dir.x * bend, y: source.y + start.dir.y * bend },
      { x: target.x + end.dir.x * bend, y: target.y + end.dir.y * bend },
      target,
    ];
  }

  if (route === "straight") {
    const direct = [source, target];
    if (!polylineCutsNodes(direct, sourceFrame, targetFrame)) return direct;
    return pickBest([[source, exit, entry, target], ...orthogonalCandidates(source, target, exit, entry, sourceFrame, targetFrame)], exit, entry, sourceFrame, targetFrame);
  }

  return pickBest(orthogonalCandidates(source, target, exit, entry, sourceFrame, targetFrame), exit, entry, sourceFrame, targetFrame);
}

/** SVG path `d` from absolute or local waypoints. */
export function connectorPath(
  source: Point,
  target: Point,
  route: ConnectorRoute,
  sourceAnchor?: Point,
  targetAnchor?: Point,
  sourceFrame?: VisualFrame,
  targetFrame?: VisualFrame,
): string {
  const points = connectorPoints(source, target, route, sourceAnchor, targetAnchor, sourceFrame, targetFrame);
  if (route === "curve") {
    const c1 = points[1]!;
    const c2 = points[2]!;
    return `M ${source.x} ${source.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${target.x} ${target.y}`;
  }
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
}

/** Axis-aligned bounds around a routed connector. */
export function connectorFrame(
  source: Point,
  target: Point,
  sourceAnchor?: Point,
  targetAnchor?: Point,
  route: ConnectorRoute = "straight",
  sourceFrame?: VisualFrame,
  targetFrame?: VisualFrame,
): VisualFrame {
  const points = connectorPoints(source, target, route, sourceAnchor, targetAnchor, sourceFrame, targetFrame);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: left,
    y: top,
    width: Math.max(1, Math.max(...xs) - left),
    height: Math.max(1, Math.max(...ys) - top),
  };
}
