import type { VisualFrame } from "../types";
import type { CanvasPoint } from "./canvas-point";
import {
  applyCornerResize,
  EDGELESS_GRID_SIZE,
  snapFrame,
  snapMoveToGrid,
  snapResize,
  snapResizeToGrid,
  type ResizeCorner,
  type SnapGuide,
} from "./geometry";

export const DEFAULT_PLACE_SIZE = { width: 160, height: 120 } as const;
export const MIN_PLACE_SIZE = 16;

export interface CreationSnapOptions {
  readonly snapToGrid: boolean;
  readonly alignObjects: boolean;
  readonly grid?: number;
  readonly threshold: number;
  readonly disabled?: boolean;
}

export interface SnappedCreationFrame {
  readonly frame: VisualFrame;
  readonly guides: readonly SnapGuide[];
}

/** Centers a remembered place size on a canvas point. */
export function centeredPlaceFrame(
  point: CanvasPoint,
  size: Pick<VisualFrame, "width" | "height"> = DEFAULT_PLACE_SIZE,
): VisualFrame {
  return {
    x: point.x - size.width / 2,
    y: point.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

/** Snaps a fixed-size click/drop frame as one moving object. */
export function snapPlacedFrame(
  frame: VisualFrame,
  candidates: readonly VisualFrame[],
  options: CreationSnapOptions,
): SnappedCreationFrame {
  if (options.disabled) return { frame, guides: [] };
  let dx = 0;
  let dy = 0;
  let guides: readonly SnapGuide[] = [];
  if (options.alignObjects) {
    const aligned = snapFrame(frame, candidates, options.threshold);
    dx = aligned.dx;
    dy = aligned.dy;
    guides = aligned.guides;
  }
  if (options.snapToGrid) {
    const locked = {
      x: guides.some((guide) => guide.axis === "x"),
      y: guides.some((guide) => guide.axis === "y"),
    };
    ({ dx, dy } = snapMoveToGrid(frame, dx, dy, options.grid ?? EDGELESS_GRID_SIZE, locked));
  }
  return { frame: { ...frame, x: frame.x + dx, y: frame.y + dy }, guides };
}

const dragCorner = (dx: number, dy: number): ResizeCorner =>
  `${dy < 0 ? "n" : "s"}${dx < 0 ? "w" : "e"}` as ResizeCorner;

/** Snaps a drag-created frame, optionally preserving a square aspect ratio. */
export function snapDraggedFrame(
  start: CanvasPoint,
  end: CanvasPoint,
  candidates: readonly VisualFrame[],
  options: CreationSnapOptions,
  square = false,
): SnappedCreationFrame {
  const snappedStart = snapPlacedFrame(
    { x: start.x, y: start.y, width: 0, height: 0 },
    candidates,
    options,
  );
  const anchor = { x: snappedStart.frame.x, y: snappedStart.frame.y };
  let rawDx = end.x - anchor.x;
  let rawDy = end.y - anchor.y;
  if (square) {
    const side = Math.max(Math.abs(rawDx), Math.abs(rawDy), MIN_PLACE_SIZE);
    rawDx = (rawDx < 0 ? -1 : 1) * side;
    rawDy = (rawDy < 0 ? -1 : 1) * side;
  }
  const corner = dragCorner(rawDx, rawDy);
  const base: VisualFrame = { x: anchor.x, y: anchor.y, width: 0, height: 0 };
  if (options.disabled) {
    return {
      frame: applyCornerResize(base, rawDx, rawDy, corner, MIN_PLACE_SIZE, MIN_PLACE_SIZE),
      guides: [],
    };
  }

  let dx = rawDx;
  let dy = rawDy;
  let guides: readonly SnapGuide[] = snappedStart.guides;
  if (options.alignObjects) {
    const aligned = snapResize(
      base,
      dx,
      dy,
      candidates,
      options.threshold,
      corner,
      MIN_PLACE_SIZE,
      MIN_PLACE_SIZE,
    );
    dx = aligned.dx;
    dy = aligned.dy;
    guides = [
      ...snappedStart.guides.filter(
        (guide) => !aligned.guides.some((candidate) => candidate.axis === guide.axis),
      ),
      ...aligned.guides,
    ];
  }
  if (options.snapToGrid) {
    const locked = {
      x: guides.some((guide) => guide.axis === "x"),
      y: guides.some((guide) => guide.axis === "y"),
    };
    ({ dx, dy } = snapResizeToGrid(
      base,
      dx,
      dy,
      corner,
      MIN_PLACE_SIZE,
      MIN_PLACE_SIZE,
      options.grid ?? EDGELESS_GRID_SIZE,
      locked,
    ));
  }

  if (square) {
    const rawSide = Math.max(Math.abs(rawDx), Math.abs(rawDy));
    const changes = [
      { axis: "x" as const, change: Math.abs(dx) - rawSide },
      { axis: "y" as const, change: Math.abs(dy) - rawSide },
    ].filter(({ change }) => change !== 0)
      .sort((left, right) => Math.abs(left.change) - Math.abs(right.change));
    const chosen = changes[0];
    const side = Math.max(MIN_PLACE_SIZE, rawSide + (chosen?.change ?? 0));
    dx = (rawDx < 0 ? -1 : 1) * side;
    dy = (rawDy < 0 ? -1 : 1) * side;
    guides = chosen ? guides.filter((guide) => guide.axis === chosen.axis) : [];
  }

  return {
    frame: applyCornerResize(base, dx, dy, corner, MIN_PLACE_SIZE, MIN_PLACE_SIZE),
    guides,
  };
}
