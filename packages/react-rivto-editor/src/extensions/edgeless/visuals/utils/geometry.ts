import type { ConnectorEndpoint, VisualFrame } from "../types";
import type { Point } from "./geometry-core";

export type { Point } from "./geometry-core";
export {
  anchorNormal,
  inflateFrame,
  pointInFrame,
  segmentIntersectsFrame,
} from "./geometry-core";
export {
  connectorFrame,
  connectorLabelCssDegrees,
  connectorLabelPoint,
  connectorLabelTangent,
  connectorPath,
  connectorPoints,
  cubicBezierMidpoint,
  mergeColinear,
  normalizeUprightLabelAngle,
  pathLength,
  pointAlongPolyline,
  polylineCutsNodes,
} from "./connector-path";

export interface SnapGuide { readonly axis: "x" | "y"; readonly position: number; readonly from: number; readonly to: number; readonly kind: "align" | "spacing" }
export interface SnapResult { readonly dx: number; readonly dy: number; readonly guides: readonly SnapGuide[] }

/** Default canvas grid step in document units (matches the viewport background). */
export const EDGELESS_GRID_SIZE = 20;

type RankedSnap = { delta: number; position: number; frame: VisualFrame; kind: SnapGuide["kind"]; rank: number };

/** Returns the smallest frame containing every supplied frame. */
export function unionFrames(frames: readonly VisualFrame[]): VisualFrame | undefined {
  if (!frames.length) return undefined;
  const x = Math.min(...frames.map((frame) => frame.x));
  const y = Math.min(...frames.map((frame) => frame.y));
  const right = Math.max(...frames.map((frame) => frame.x + frame.width));
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** Resolves an attached endpoint against its current object frame. */
export function endpointPoint(endpoint: ConnectorEndpoint, frame?: VisualFrame): Point {
  return frame ? { x: frame.x + frame.width * endpoint.anchor.x, y: frame.y + frame.height * endpoint.anchor.y } : endpoint.position;
}

/** Edge-center anchors used for connector attachment. */
export function edgeAnchors(frame: VisualFrame): Array<{ x: number; y: number; ax: number; ay: number }> {
  return [
    { ax: .5, ay: 0, x: frame.x + frame.width * .5, y: frame.y },
    { ax: 1, ay: .5, x: frame.x + frame.width, y: frame.y + frame.height * .5 },
    { ax: .5, ay: 1, x: frame.x + frame.width * .5, y: frame.y + frame.height },
    { ax: 0, ay: .5, x: frame.x, y: frame.y + frame.height * .5 },
  ];
}

/** Chooses the nearest of four edge-center anchors for a pointer. */
export function nearestAnchor(frame: VisualFrame, point: Point): Point {
  return edgeAnchors(frame).reduce((best, anchor) => {
    const distance = Math.hypot(anchor.x - point.x, anchor.y - point.y);
    const bestDistance = Math.hypot(frame.x + frame.width * best.x - point.x, frame.y + frame.height * best.y - point.y);
    return distance < bestDistance ? { x: anchor.ax, y: anchor.ay } : best;
  }, { x: .5, y: 0 });
}

const betterSnap = (current: RankedSnap | undefined, next: RankedSnap): boolean => {
  if (!current) return true;
  const d = Math.abs(next.delta) - Math.abs(current.delta);
  if (d < -1e-9) return true;
  if (d > 1e-9) return false;
  return next.rank > current.rank;
};

/** Finds the nearest edge/center snap on each axis and returns canvas-space guides. */
export function snapFrame(moving: VisualFrame, candidates: readonly VisualFrame[], threshold: number): SnapResult {
  const movingFeaturesX = [
    { value: moving.x, rank: 0 },
    { value: moving.x + moving.width / 2, rank: 1 },
    { value: moving.x + moving.width, rank: 0 },
  ];
  const movingFeaturesY = [
    { value: moving.y, rank: 0 },
    { value: moving.y + moving.height / 2, rank: 1 },
    { value: moving.y + moving.height, rank: 0 },
  ];
  let x: RankedSnap | undefined;
  let y: RankedSnap | undefined;
  candidates.forEach((frame) => {
    const targetX = [
      { position: frame.x, rank: 0 },
      { position: frame.x + frame.width / 2, rank: 1 },
      { position: frame.x + frame.width, rank: 0 },
    ];
    const targetY = [
      { position: frame.y, rank: 0 },
      { position: frame.y + frame.height / 2, rank: 1 },
      { position: frame.y + frame.height, rank: 0 },
    ];
    targetX.forEach((target) => movingFeaturesX.forEach((feature) => {
      const delta = target.position - feature.value;
      const next = { delta, position: target.position, frame, kind: "align" as const, rank: target.rank + feature.rank };
      if (Math.abs(delta) <= threshold && betterSnap(x, next)) x = next;
    }));
    targetY.forEach((target) => movingFeaturesY.forEach((feature) => {
      const delta = target.position - feature.value;
      const next = { delta, position: target.position, frame, kind: "align" as const, rank: target.rank + feature.rank };
      if (Math.abs(delta) <= threshold && betterSnap(y, next)) y = next;
    }));
  });
  const horizontal = [...candidates].sort((a, b) => a.x - b.x);
  for (let index = 0; index < horizontal.length - 1; index += 1) {
    const left = horizontal[index]!, right = horizontal[index + 1]!;
    const target = left.x + left.width + (right.x - left.x - left.width - moving.width) / 2;
    const delta = target - moving.x;
    const next: RankedSnap = {
      delta,
      position: target + moving.width / 2,
      kind: "spacing",
      rank: 0,
      frame: { x: left.x, y: Math.min(left.y, right.y), width: right.x + right.width - left.x, height: Math.max(left.y + left.height, right.y + right.height) - Math.min(left.y, right.y) },
    };
    if (Math.abs(delta) <= threshold && betterSnap(x, next)) x = next;
  }
  const vertical = [...candidates].sort((a, b) => a.y - b.y);
  for (let index = 0; index < vertical.length - 1; index += 1) {
    const top = vertical[index]!, bottom = vertical[index + 1]!;
    const target = top.y + top.height + (bottom.y - top.y - top.height - moving.height) / 2;
    const delta = target - moving.y;
    const next: RankedSnap = {
      delta,
      position: target + moving.height / 2,
      kind: "spacing",
      rank: 0,
      frame: { x: Math.min(top.x, bottom.x), y: top.y, width: Math.max(top.x + top.width, bottom.x + bottom.width) - Math.min(top.x, bottom.x), height: bottom.y + bottom.height - top.y },
    };
    if (Math.abs(delta) <= threshold && betterSnap(y, next)) y = next;
  }
  const dx = x?.delta ?? 0;
  const dy = y?.delta ?? 0;
  const snapped = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: SnapGuide[] = [];
  if (x) guides.push({ axis: "x", position: x.position, from: Math.min(snapped.y, x.frame.y), to: Math.max(snapped.y + snapped.height, x.frame.y + x.frame.height), kind: x.kind });
  if (y) guides.push({ axis: "y", position: y.position, from: Math.min(snapped.x, y.frame.x), to: Math.max(snapped.x + snapped.width, y.frame.x + y.frame.width), kind: y.kind });
  return { dx, dy, guides };
}

/** Corner used by the active resize handle. */
export type ResizeCorner = "nw" | "ne" | "sw" | "se";

/** Applies pointer delta from one corner while keeping the opposite edges fixed. */
export function applyCornerResize(
  frame: VisualFrame,
  dx: number,
  dy: number,
  corner: ResizeCorner,
  minWidth: number,
  minHeight: number,
): VisualFrame {
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  let x = frame.x;
  let y = frame.y;
  let width = frame.width;
  let height = frame.height;
  if (corner === "se" || corner === "ne") width = Math.max(minWidth, frame.width + dx);
  if (corner === "sw" || corner === "nw") {
    width = Math.max(minWidth, frame.width - dx);
    x = right - width;
  }
  if (corner === "se" || corner === "sw") height = Math.max(minHeight, frame.height + dy);
  if (corner === "ne" || corner === "nw") {
    height = Math.max(minHeight, frame.height - dy);
    y = bottom - height;
  }
  return { x, y, width, height };
}

/** Snaps a resized frame's moving edges to candidate edges and centers. */
export function snapResize(
  frame: VisualFrame,
  dx: number,
  dy: number,
  candidates: readonly VisualFrame[],
  threshold: number,
  corner: ResizeCorner = "se",
  minWidth = 1,
  minHeight = 1,
): SnapResult {
  const next = applyCornerResize(frame, dx, dy, corner, minWidth, minHeight);
  const moveLeft = corner === "nw" || corner === "sw";
  const moveTop = corner === "nw" || corner === "ne";
  let bestX: RankedSnap | undefined;
  let bestY: RankedSnap | undefined;
  const edgeX = moveLeft ? next.x : next.x + next.width;
  const edgeY = moveTop ? next.y : next.y + next.height;
  candidates.forEach((candidate) => {
    [
      { position: candidate.x, rank: 0 },
      { position: candidate.x + candidate.width / 2, rank: 1 },
      { position: candidate.x + candidate.width, rank: 0 },
    ].forEach((target) => {
      const delta = target.position - edgeX;
      const ranked = { delta, position: target.position, frame: candidate, kind: "align" as const, rank: target.rank };
      if (Math.abs(delta) <= threshold && betterSnap(bestX, ranked)) bestX = ranked;
    });
    [
      { position: candidate.y, rank: 0 },
      { position: candidate.y + candidate.height / 2, rank: 1 },
      { position: candidate.y + candidate.height, rank: 0 },
    ].forEach((target) => {
      const delta = target.position - edgeY;
      const ranked = { delta, position: target.position, frame: candidate, kind: "align" as const, rank: target.rank };
      if (Math.abs(delta) <= threshold && betterSnap(bestY, ranked)) bestY = ranked;
    });
  });
  // Moving left/top edges still advance with +delta: applyCornerResize maps
  // dx→left via x = frame.x + dx (and dy→top likewise), same as SE's right/bottom.
  const nextDx = dx + (bestX?.delta ?? 0);
  const nextDy = dy + (bestY?.delta ?? 0);
  const snapped = applyCornerResize(frame, nextDx, nextDy, corner, minWidth, minHeight);
  const guides: SnapGuide[] = [];
  if (bestX) {
    guides.push({
      axis: "x",
      position: bestX.position,
      from: Math.min(snapped.y, bestX.frame.y),
      to: Math.max(snapped.y + snapped.height, bestX.frame.y + bestX.frame.height),
      kind: "align",
    });
  }
  if (bestY) {
    guides.push({
      axis: "y",
      position: bestY.position,
      from: Math.min(snapped.x, bestY.frame.x),
      to: Math.max(snapped.x + snapped.width, bestY.frame.x + bestY.frame.width),
      kind: "align",
    });
  }
  return { dx: nextDx, dy: nextDy, guides };
}

/** Nearest grid line for a scalar. */
export function snapScalarToGrid(value: number, grid = EDGELESS_GRID_SIZE): number {
  const step = Math.max(1, grid);
  return Math.round(value / step) * step;
}

/**
 * Adjusts a move delta so the resulting frame origin lands on the grid.
 * Axes already locked by object-alignment guides are left unchanged.
 */
export function snapMoveToGrid(
  frame: VisualFrame,
  dx: number,
  dy: number,
  grid = EDGELESS_GRID_SIZE,
  locked: { readonly x?: boolean; readonly y?: boolean } = {},
): { dx: number; dy: number } {
  const nextX = frame.x + dx;
  const nextY = frame.y + dy;
  return {
    dx: locked.x ? dx : dx + (snapScalarToGrid(nextX, grid) - nextX),
    dy: locked.y ? dy : dy + (snapScalarToGrid(nextY, grid) - nextY),
  };
}

/**
 * Adjusts a resize delta so the moving edges land on the grid.
 * Axes already locked by object-alignment guides are left unchanged.
 */
export function snapResizeToGrid(
  frame: VisualFrame,
  dx: number,
  dy: number,
  corner: ResizeCorner,
  minWidth = 1,
  minHeight = 1,
  grid = EDGELESS_GRID_SIZE,
  locked: { readonly x?: boolean; readonly y?: boolean } = {},
): { dx: number; dy: number } {
  const next = applyCornerResize(frame, dx, dy, corner, minWidth, minHeight);
  const moveLeft = corner === "nw" || corner === "sw";
  const moveTop = corner === "nw" || corner === "ne";
  let nextDx = dx;
  let nextDy = dy;
  if (!locked.x) {
    const edge = moveLeft ? next.x : next.x + next.width;
    nextDx = dx + (snapScalarToGrid(edge, grid) - edge);
  }
  if (!locked.y) {
    const edge = moveTop ? next.y : next.y + next.height;
    nextDy = dy + (snapScalarToGrid(edge, grid) - edge);
  }
  return { dx: nextDx, dy: nextDy };
}
