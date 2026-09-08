import type { ConnectorEndpoint, VisualFrame } from "../types";
import type { Point } from "./geometry-core";
import { segmentIntersectsFrame } from "./geometry-core";

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

/**
 * Normalizes a finite clockwise rotation into the half-open `[0, 360)` range.
 *
 * @param rotation - Rotation in degrees; non-finite input is treated as zero.
 * @returns The equivalent finite clockwise degree value.
 */
export function normalizeRotation(rotation: number): number {
  return Number.isFinite(rotation) ? ((rotation % 360) + 360) % 360 : 0;
}

/**
 * Rotates one canvas point around a center by clockwise CSS degrees.
 *
 * @param point - Canvas point to rotate.
 * @param center - Fixed center of rotation.
 * @param rotation - Clockwise rotation in degrees.
 * @returns The rotated canvas point.
 */
export function rotatePoint(point: Point, center: Point, rotation: number): Point {
  const radians = normalizeRotation(rotation) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return { x: center.x + x * cosine - y * sine, y: center.y + x * sine + y * cosine };
}

/**
 * Returns the axis-aligned canvas bounds occupied by a rotated frame.
 *
 * @param frame - Unrotated persisted frame.
 * @param rotation - Clockwise visual rotation in degrees.
 * @returns Axis-aligned bounds containing all rotated corners.
 */
export function rotatedFrameBounds(frame: VisualFrame, rotation = 0): VisualFrame {
  if (!normalizeRotation(rotation)) return { ...frame };
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const points = [
    { x: frame.x, y: frame.y },
    { x: frame.x + frame.width, y: frame.y },
    { x: frame.x + frame.width, y: frame.y + frame.height },
    { x: frame.x, y: frame.y + frame.height },
  ].map((point) => rotatePoint(point, center, rotation));
  const x = Math.min(...points.map((point) => point.x));
  const y = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Tests a point against a frame after undoing the frame's visual rotation.
 *
 * @param point - Canvas point to test.
 * @param frame - Unrotated persisted frame.
 * @param rotation - Clockwise visual rotation in degrees.
 * @returns Whether the point lies inside or on the rotated frame.
 */
export function pointInRotatedFrame(point: Point, frame: VisualFrame, rotation = 0): boolean {
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const local = rotatePoint(point, center, -rotation);
  return local.x >= frame.x && local.x <= frame.x + frame.width && local.y >= frame.y && local.y <= frame.y + frame.height;
}

/**
 * Tests a canvas segment against a rotated frame in the frame's local axes.
 *
 * @param a - First segment endpoint.
 * @param b - Second segment endpoint.
 * @param frame - Unrotated persisted frame.
 * @param rotation - Clockwise visual rotation in degrees.
 * @returns Whether the segment crosses or touches the rotated frame.
 */
export function segmentIntersectsRotatedFrame(a: Point, b: Point, frame: VisualFrame, rotation = 0): boolean {
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  return segmentIntersectsFrame(rotatePoint(a, center, -rotation), rotatePoint(b, center, -rotation), frame);
}

/**
 * Resolves an attached endpoint against its current object frame and rotation.
 *
 * @param endpoint - Stored connector endpoint and normalized anchor.
 * @param frame - Current unrotated frame of the attached element.
 * @param rotation - Clockwise visual rotation in degrees.
 * @returns The endpoint's current canvas position.
 */
export function endpointPoint(endpoint: ConnectorEndpoint, frame?: VisualFrame, rotation = 0): Point {
  if (!frame) return endpoint.position;
  const point = { x: frame.x + frame.width * endpoint.anchor.x, y: frame.y + frame.height * endpoint.anchor.y };
  return rotatePoint(point, { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }, rotation);
}

/**
 * Produces edge-center anchors used for connector attachment.
 *
 * @param frame - Current unrotated frame.
 * @param rotation - Clockwise visual rotation in degrees.
 * @returns Rotated canvas positions paired with normalized anchor coordinates.
 */
export function edgeAnchors(frame: VisualFrame, rotation = 0): Array<{ x: number; y: number; ax: number; ay: number }> {
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  return [
    { ax: .5, ay: 0, x: frame.x + frame.width * .5, y: frame.y },
    { ax: 1, ay: .5, x: frame.x + frame.width, y: frame.y + frame.height * .5 },
    { ax: .5, ay: 1, x: frame.x + frame.width * .5, y: frame.y + frame.height },
    { ax: 0, ay: .5, x: frame.x, y: frame.y + frame.height * .5 },
  ].map((anchor) => ({ ...anchor, ...rotatePoint(anchor, center, rotation) }));
}

/**
 * Chooses the nearest of four edge-center anchors for a pointer.
 *
 * @param frame - Current unrotated frame.
 * @param point - Canvas pointer position.
 * @param rotation - Clockwise visual rotation in degrees.
 * @returns Normalized coordinates of the nearest anchor.
 */
export function nearestAnchor(frame: VisualFrame, point: Point, rotation = 0): Point {
  const anchors = edgeAnchors(frame, rotation);
  return anchors.reduce((best, anchor) => {
    const distance = Math.hypot(anchor.x - point.x, anchor.y - point.y);
    const current = anchors.find((candidate) => candidate.ax === best.x && candidate.ay === best.y)!;
    const bestDistance = Math.hypot(current.x - point.x, current.y - point.y);
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

/** Edge or corner used by the active resize handle. */
export type ResizeCorner = "n" | "e" | "s" | "w" | "nw" | "ne" | "sw" | "se";

/**
 * Applies pointer delta from one handle while keeping the opposite edges fixed.
 *
 * @param frame - Initial unrotated frame.
 * @param dx - Horizontal local-axis pointer delta.
 * @param dy - Vertical local-axis pointer delta.
 * @param corner - Active side or corner handle.
 * @param minWidth - Smallest permitted width.
 * @param minHeight - Smallest permitted height.
 * @returns The resized unrotated frame.
 */
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
  if (corner.includes("e")) width = Math.max(minWidth, frame.width + dx);
  if (corner.includes("w")) {
    width = Math.max(minWidth, frame.width - dx);
    x = right - width;
  }
  if (corner.includes("s")) height = Math.max(minHeight, frame.height + dy);
  if (corner.includes("n")) {
    height = Math.max(minHeight, frame.height - dy);
    y = bottom - height;
  }
  return { x, y, width, height };
}

/**
 * Resizes in a rotated frame's local axes while keeping its opposite handle fixed.
 *
 * @param frame - Initial unrotated persisted frame.
 * @param dx - Horizontal canvas pointer delta.
 * @param dy - Vertical canvas pointer delta.
 * @param handle - Active side or corner handle.
 * @param minWidth - Smallest permitted width.
 * @param minHeight - Smallest permitted height.
 * @param rotation - Clockwise visual rotation in degrees.
 * @returns Resized frame whose opposite handle stays at its canvas position.
 */
export function applyRotatedResize(
  frame: VisualFrame,
  dx: number,
  dy: number,
  handle: ResizeCorner,
  minWidth: number,
  minHeight: number,
  rotation = 0,
): VisualFrame {
  const radians = -normalizeRotation(rotation) * Math.PI / 180;
  const localDx = dx * Math.cos(radians) - dy * Math.sin(radians);
  const localDy = dx * Math.sin(radians) + dy * Math.cos(radians);
  const local = applyCornerResize({ x: 0, y: 0, width: frame.width, height: frame.height }, localDx, localDy, handle, minWidth, minHeight);
  const widthDelta = local.width - frame.width;
  const heightDelta = local.height - frame.height;
  const localShift = {
    x: handle.includes("e") ? widthDelta / 2 : handle.includes("w") ? -widthDelta / 2 : 0,
    y: handle.includes("s") ? heightDelta / 2 : handle.includes("n") ? -heightDelta / 2 : 0,
  };
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const shifted = rotatePoint({ x: center.x + localShift.x, y: center.y + localShift.y }, center, rotation);
  return { x: shifted.x - local.width / 2, y: shifted.y - local.height / 2, width: local.width, height: local.height };
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
  const moveLeft = corner.includes("w");
  const moveTop = corner.includes("n");
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
      if (corner.includes("e") || corner.includes("w")) {
        if (Math.abs(delta) <= threshold && betterSnap(bestX, ranked)) bestX = ranked;
      }
    });
    [
      { position: candidate.y, rank: 0 },
      { position: candidate.y + candidate.height / 2, rank: 1 },
      { position: candidate.y + candidate.height, rank: 0 },
    ].forEach((target) => {
      const delta = target.position - edgeY;
      const ranked = { delta, position: target.position, frame: candidate, kind: "align" as const, rank: target.rank };
      if (corner.includes("n") || corner.includes("s")) {
        if (Math.abs(delta) <= threshold && betterSnap(bestY, ranked)) bestY = ranked;
      }
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
  const moveLeft = corner.includes("w");
  const moveTop = corner.includes("n");
  let nextDx = dx;
  let nextDy = dy;
  if (!locked.x && (corner.includes("e") || corner.includes("w"))) {
    const edge = moveLeft ? next.x : next.x + next.width;
    nextDx = dx + (snapScalarToGrid(edge, grid) - edge);
  }
  if (!locked.y && (corner.includes("n") || corner.includes("s"))) {
    const edge = moveTop ? next.y : next.y + next.height;
    nextDy = dy + (snapScalarToGrid(edge, grid) - edge);
  }
  return { dx: nextDx, dy: nextDy };
}
